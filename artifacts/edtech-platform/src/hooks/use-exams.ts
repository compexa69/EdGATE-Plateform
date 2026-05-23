import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExamQuestion {
  id: string;
  text: string;
  options: string[];
  correctOption: number;
  marks: number;
  imageUrl: string | null;
  textSolution: string | null;
  videoUrl: string | null;
  qrCodeSvg: string | null;
}

export interface FullExam {
  id: string;
  title: string;
  type: string;
  durationMinutes: number;
  passingScore: number | null;
  negativeMarking: number;
  isUnlocked: boolean;
  questions: ExamQuestion[];
}

export interface ExamAttempt {
  id: string;
  remainingSeconds: number;
  answers: Array<{
    questionId: string;
    selectedOption: number | null;
    isMarkedForReview: boolean;
    timeSpentSeconds: number;
  }>;
}

// ─── Exam Queries ────────────────────────────────────────────────────────────

export function useGetExam(examId: string) {
  return useQuery<FullExam>({
    queryKey: ["exam", examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data: exam, error } = await supabase
        .from("exams")
        .select("id, title, type, duration_minutes, passing_score, negative_marking")
        .eq("id", examId)
        .single();
      if (error || !exam) throw new Error("Exam not found");

      const { data: examQuestions } = await supabase
        .from("exam_questions")
        .select("question_id, order")
        .eq("exam_id", examId)
        .order("order");

      const questionIds = (examQuestions ?? []).map((eq) => eq.question_id);
      let questions: ExamQuestion[] = [];

      if (questionIds.length > 0) {
        const { data: qs } = await supabase
          .from("questions")
          .select("id, text, options, correct_option, marks, image_url, text_solution, video_url, qr_code_svg")
          .in("id", questionIds);

        const qMap = new Map((qs ?? []).map((q) => [q.id, q]));
        questions = (examQuestions ?? [])
          .filter((eq) => qMap.has(eq.question_id))
          .map((eq) => {
            const q = qMap.get(eq.question_id)!;
            return {
              id: q.id,
              text: q.text,
              options: q.options as string[],
              correctOption: parseInt(q.correct_option ?? "0"),
              marks: q.marks,
              imageUrl: q.image_url,
              textSolution: q.text_solution,
              videoUrl: q.video_url,
              qrCodeSvg: q.qr_code_svg,
            };
          });
      }

      return {
        id: exam.id,
        title: exam.title,
        type: exam.type,
        durationMinutes: exam.duration_minutes,
        passingScore: exam.passing_score,
        negativeMarking: exam.negative_marking,
        isUnlocked: true,
        questions,
      };
    },
  });
}

export function useListExams(filter?: { type?: string; subjectId?: string }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["exams", filter, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase.from("exams").select("id, title, type, subject_id, chapter_id, topic_id, duration_minutes, passing_score");
      if (filter?.type) q = q.eq("type", filter.type);
      if (filter?.subjectId) q = q.eq("subject_id", filter.subjectId);
      const { data, error } = await q.order("created_at");
      if (error) throw error;

      const { data: results } = await supabase
        .from("exam_results")
        .select("exam_id, passed")
        .eq("user_id", user!.id);
      const passedSet = new Set((results ?? []).filter((r) => r.passed).map((r) => r.exam_id));

      return (data ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        subjectId: e.subject_id,
        chapterId: e.chapter_id,
        topicId: e.topic_id,
        durationMinutes: e.duration_minutes,
        passingScore: e.passing_score,
        isUnlocked: true,
        isPassed: passedSet.has(e.id),
      }));
    },
  });
}

// ─── Exam Mutations ──────────────────────────────────────────────────────────

export function useStartExam() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (examId: string): Promise<ExamAttempt> => {
      const { data: exam } = await supabase
        .from("exams")
        .select("duration_minutes")
        .eq("id", examId)
        .single();

      const durationSeconds = (exam?.duration_minutes ?? 60) * 60;

      const { data: existing } = await supabase
        .from("exam_attempts")
        .select("id, remaining_seconds, status")
        .eq("user_id", user!.id)
        .eq("exam_id", examId)
        .in("status", ["in_progress", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let attemptId: string;
      let remainingSeconds: number;

      if (existing) {
        attemptId = existing.id;
        remainingSeconds = existing.remaining_seconds;
        if (existing.status === "paused") {
          await supabase.from("exam_attempts").update({ status: "in_progress", resumed_at: new Date().toISOString() }).eq("id", existing.id);
        }
      } else {
        const { data: newAttempt, error } = await supabase
          .from("exam_attempts")
          .insert({ user_id: user!.id, exam_id: examId, status: "in_progress", remaining_seconds: durationSeconds })
          .select("id, remaining_seconds")
          .single();
        if (error || !newAttempt) throw new Error("Failed to start exam");
        attemptId = newAttempt.id;
        remainingSeconds = newAttempt.remaining_seconds;
      }

      const { data: savedAnswers } = await supabase
        .from("attempt_answers")
        .select("question_id, selected_option, is_marked_for_review, time_spent_seconds")
        .eq("attempt_id", attemptId);

      const answers = (savedAnswers ?? []).map((a) => ({
        questionId: a.question_id,
        selectedOption: a.selected_option !== null && a.selected_option !== undefined ? parseInt(a.selected_option) : null,
        isMarkedForReview: a.is_marked_for_review,
        timeSpentSeconds: a.time_spent_seconds,
      }));

      return { id: attemptId, remainingSeconds, answers };
    },
  });
}

export function useSaveAnswer() {
  return useMutation({
    mutationFn: async (params: {
      attemptId: string;
      questionId: string;
      selectedOption: number | null;
      isMarkedForReview: boolean;
      timeSpentSeconds: number;
    }) => {
      const { error } = await supabase.from("attempt_answers").upsert(
        {
          attempt_id: params.attemptId,
          question_id: params.questionId,
          selected_option: params.selectedOption !== null ? String(params.selectedOption) : null,
          is_marked_for_review: params.isMarkedForReview,
          time_spent_seconds: params.timeSpentSeconds,
        },
        { onConflict: "attempt_id,question_id" },
      );
      if (error) throw error;
    },
  });
}

export function useSubmitExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      attemptId: string;
      answers: Array<{ questionId: string; selectedOption: number | null; isMarkedForReview: boolean; timeSpentSeconds: number }>;
    }) => {
      for (const ans of params.answers) {
        await supabase.from("attempt_answers").upsert(
          {
            attempt_id: params.attemptId,
            question_id: ans.questionId,
            selected_option: ans.selectedOption !== null ? String(ans.selectedOption) : null,
            is_marked_for_review: ans.isMarkedForReview,
            time_spent_seconds: ans.timeSpentSeconds,
          },
          { onConflict: "attempt_id,question_id" },
        );
      }

      const { data, error } = await supabase.functions.invoke("score-exam", {
        body: { attemptId: params.attemptId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await supabase.from("exam_attempts").update({ status: "submitted", end_time: new Date().toISOString() }).eq("id", params.attemptId);

      return data as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results"] });
      qc.invalidateQueries({ queryKey: ["topics"] });
      qc.invalidateQueries({ queryKey: ["subject"] });
    },
  });
}

export function usePauseExam() {
  return useMutation({
    mutationFn: async ({ attemptId, remainingSeconds }: { attemptId: string; remainingSeconds: number }) => {
      const { data: attempt, error } = await supabase
        .from("exam_attempts")
        .select("pause_count")
        .eq("id", attemptId)
        .single();
      if (error || !attempt) throw new Error("Attempt not found");

      const MAX_PAUSES = 2;
      if (attempt.pause_count >= MAX_PAUSES) {
        const err = Object.assign(new Error("Pause limit reached"), {
          response: { data: { pausesUsed: attempt.pause_count, maxPauses: MAX_PAUSES, reason: `You cannot pause this exam anymore (${attempt.pause_count}/${MAX_PAUSES} pauses used).` } }
        });
        throw err;
      }

      const { error: updateErr } = await supabase.from("exam_attempts").update({
        status: "paused",
        remaining_seconds: remainingSeconds,
        pause_count: attempt.pause_count + 1,
      }).eq("id", attemptId);
      if (updateErr) throw updateErr;

      return { pausesUsed: attempt.pause_count + 1, maxPauses: MAX_PAUSES };
    },
  });
}

export function useResumeExam() {
  return useMutation({
    mutationFn: async (attemptId: string) => {
      const { error } = await supabase.from("exam_attempts").update({
        status: "in_progress",
        resumed_at: new Date().toISOString(),
      }).eq("id", attemptId);
      if (error) throw error;
    },
  });
}

export function useSyncExamTime(attemptId: string | null, isPaused: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["exam-sync", attemptId],
    enabled: !!attemptId && !isPaused && !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("exam_attempts")
        .select("remaining_seconds")
        .eq("id", attemptId!)
        .single();
      return { remainingSeconds: data?.remaining_seconds ?? null };
    },
  });
}

// ─── Results ─────────────────────────────────────────────────────────────────

export function useGetResult(resultId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["result", resultId, user?.id],
    enabled: !!resultId && !!user?.id,
    queryFn: async () => {
      const { data: result, error } = await supabase
        .from("exam_results")
        .select("*")
        .eq("id", resultId)
        .single();
      if (error || !result) throw new Error("Result not found");

      const { data: attempt } = await supabase
        .from("exam_attempts")
        .select("exam_id, start_time, end_time")
        .eq("id", result.attempt_id)
        .single();

      const { data: exam } = await supabase
        .from("exams")
        .select("id, title, type, topic_id, chapter_id, subject_id, passing_score, negative_marking")
        .eq("id", result.exam_id)
        .single();

      const { data: examQuestions } = await supabase
        .from("exam_questions")
        .select("question_id, order")
        .eq("exam_id", result.exam_id)
        .order("order");

      const questionIds = (examQuestions ?? []).map((eq) => eq.question_id);
      let questionsMap = new Map<string, any>();

      if (questionIds.length > 0) {
        const { data: qs } = await supabase
          .from("questions")
          .select("id, text, options, correct_option, marks, image_url, text_solution, video_url, qr_code_svg, topic_id")
          .in("id", questionIds);
        for (const q of qs ?? []) questionsMap.set(q.id, q);
      }

      const { data: answers } = await supabase
        .from("attempt_answers")
        .select("question_id, selected_option, is_marked_for_review, time_spent_seconds")
        .eq("attempt_id", result.attempt_id);

      const answerMap = new Map((answers ?? []).map((a) => [a.question_id, a]));

      const topicAccuracy = new Map<string, { correct: number; total: number; name: string }>();

      const questionWise = (examQuestions ?? []).map((eq) => {
        const q = questionsMap.get(eq.question_id);
        if (!q) return null;
        const ans = answerMap.get(q.id);
        const correctOption = parseInt(q.correct_option ?? "0");
        const selectedOption = ans?.selected_option !== null && ans?.selected_option !== undefined
          ? parseInt(ans.selected_option) : null;
        const isCorrect = selectedOption !== null && selectedOption === correctOption;
        const negativeMarking = exam?.negative_marking ?? 1;
        const marksAwarded = selectedOption === null ? 0 : isCorrect ? q.marks : -negativeMarking;

        if (q.topic_id) {
          const existing = topicAccuracy.get(q.topic_id) ?? { correct: 0, total: 0, name: q.topic_id };
          topicAccuracy.set(q.topic_id, {
            correct: existing.correct + (isCorrect ? 1 : 0),
            total: existing.total + 1,
            name: existing.name,
          });
        }

        return {
          questionId: q.id,
          questionText: q.text,
          options: q.options as string[],
          correctOption,
          selectedOption,
          isCorrect,
          marksAwarded,
          timeSpentSeconds: ans?.time_spent_seconds ?? 0,
          imageUrl: q.image_url,
          textSolution: q.text_solution,
          videoUrl: q.video_url,
          qrCodeSvg: q.qr_code_svg,
        };
      }).filter(Boolean);

      const { data: topicData } = await supabase
        .from("topics")
        .select("id, name")
        .in("id", [...topicAccuracy.keys()]);
      for (const t of topicData ?? []) {
        const entry = topicAccuracy.get(t.id);
        if (entry) topicAccuracy.set(t.id, { ...entry, name: t.name });
      }

      const topicWise = [...topicAccuracy.entries()].map(([topicId, data]) => ({
        topicId,
        topicName: data.name,
        correctAnswers: data.correct,
        totalQuestions: data.total,
        accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      }));

      const allResults = await supabase
        .from("exam_results")
        .select("score")
        .eq("exam_id", result.exam_id);
      const allScores = (allResults.data ?? []).map((r) => r.score).sort((a, b) => a - b);
      const rank = allScores.indexOf(result.score) + 1;
      const percentile = allScores.length > 1
        ? Math.round(((allScores.length - rank) / (allScores.length - 1)) * 100) : 100;

      return {
        id: result.id,
        examId: exam?.id,
        examTitle: exam?.title ?? "Exam",
        examType: exam?.type,
        score: result.score,
        maxScore: result.max_score,
        accuracy: result.accuracy,
        totalQuestions: result.total_questions,
        correctAnswers: result.correct_answers,
        incorrectAnswers: result.incorrect_answers,
        skippedAnswers: result.skipped_answers,
        timeTakenSeconds: result.time_taken_seconds,
        passed: result.passed,
        percentile,
        questionWise,
        topicWise,
      };
    },
  });
}

export function useLogQrScan() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: { questionId: string; examId: string | null; resultId: string }) => {
      await supabase.from("qr_scan_logs").insert({
        user_id: user!.id,
        question_id: params.questionId,
        exam_id: params.examId,
        result_id: params.resultId,
      });
    },
  });
}

// ─── Admin exam management ────────────────────────────────────────────────────

export function useAdminListExams(filter?: { type?: string }) {
  return useQuery({
    queryKey: ["admin-exams", filter],
    queryFn: async () => {
      let q = supabase.from("exams").select("*").order("created_at", { ascending: false });
      if (filter?.type) q = q.eq("type", filter.type);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string; type: string; subject_id?: string; chapter_id?: string; topic_id?: string;
      duration_minutes?: number; passing_score?: number; negative_marking?: number;
    }) => {
      const { data: result, error } = await supabase.from("exams").insert(data).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-exams"] }); },
  });
}

export function useDeleteExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-exams"] }); },
  });
}

export function useListExamQuestions(examId: string) {
  return useQuery({
    queryKey: ["exam-questions", examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data: eqs } = await supabase
        .from("exam_questions")
        .select("id, question_id, order")
        .eq("exam_id", examId)
        .order("order");

      if (!eqs || eqs.length === 0) return [];

      const qIds = eqs.map((eq) => eq.question_id);
      const { data: questions } = await supabase.from("questions").select("*").in("id", qIds);
      const qMap = new Map((questions ?? []).map((q) => [q.id, q]));

      return eqs.map((eq) => ({ ...qMap.get(eq.question_id), examQuestionId: eq.id, order: eq.order }));
    },
  });
}

export function useAddExamQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ examId, questionId, order }: { examId: string; questionId: string; order: number }) => {
      const { error } = await supabase.from("exam_questions").insert({ exam_id: examId, question_id: questionId, order });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["exam-questions", vars.examId] }); },
  });
}

export function useRemoveExamQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ examQuestionId, examId }: { examQuestionId: string; examId: string }) => {
      const { error } = await supabase.from("exam_questions").delete().eq("id", examQuestionId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["exam-questions", vars.examId] }); },
  });
}
