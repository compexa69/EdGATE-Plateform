import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "skipped";
  source: "auto" | "manual";
  topicId: string | null;
  topicName: string | null;
  chapterName: string | null;
  subjectName: string | null;
  scheduledDate: string;
  sortOrder: number;
}

export function useTasksRange(startDate: string, endDate: string) {
  const { user } = useAuth();
  return useQuery<Task[]>({
    queryKey: ["tasks-range", startDate, endDate, user?.id],
    enabled: !!user?.id && !!startDate && !!endDate,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from("study_tasks")
        .select("id, title, description, status, source, topic_id, sort_order, scheduled_date")
        .eq("user_id", user!.id)
        .gte("scheduled_date", startDate)
        .lte("scheduled_date", endDate)
        .order("sort_order");
      if (error) throw error;

      if (!tasks || tasks.length === 0) return [];

      const topicIds = [...new Set(tasks.map((t) => t.topic_id).filter(Boolean))] as string[];
      let topicMap = new Map<string, { name: string; chapterId: string }>();
      let chapterMap = new Map<string, { name: string; subjectId: string }>();
      let subjectMap = new Map<string, string>();

      if (topicIds.length > 0) {
        const { data: topics } = await supabase.from("topics").select("id, name, chapter_id").in("id", topicIds);
        for (const t of topics ?? []) topicMap.set(t.id, { name: t.name, chapterId: t.chapter_id });

        const chapterIds = [...new Set((topics ?? []).map((t) => t.chapter_id))];
        if (chapterIds.length > 0) {
          const { data: chapters } = await supabase.from("chapters").select("id, name, subject_id").in("id", chapterIds);
          for (const c of chapters ?? []) chapterMap.set(c.id, { name: c.name, subjectId: c.subject_id });

          const subjectIds = [...new Set((chapters ?? []).map((c) => c.subject_id))];
          if (subjectIds.length > 0) {
            const { data: subjects } = await supabase.from("subjects").select("id, name").in("id", subjectIds);
            for (const s of subjects ?? []) subjectMap.set(s.id, s.name);
          }
        }
      }

      return tasks.map((t) => {
        const topic = t.topic_id ? topicMap.get(t.topic_id) : null;
        const chapter = topic ? chapterMap.get(topic.chapterId) : null;
        const subject = chapter ? subjectMap.get(chapter.subjectId) : null;

        return {
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status as Task["status"],
          source: t.source as Task["source"],
          topicId: t.topic_id,
          topicName: topic?.name ?? null,
          chapterName: chapter?.name ?? null,
          subjectName: subject ?? null,
          scheduledDate: t.scheduled_date,
          sortOrder: t.sort_order,
        };
      });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: Task["status"]; sortOrder?: number }) => {
      const dbUpdates: Record<string, any> = {};
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

      const { error } = await supabase.from("study_tasks").update(dbUpdates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks-range"] }); },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("study_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks-range"] }); },
  });
}

export function useGeneratePlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: { examDate: string; dailyStudyHours: number; targetScore: number }) => {
      const { data, error } = await supabase.functions.invoke("generate-study-plan", {
        body: { ...config, userId: user!.id },
      });
      if (error) {
        const generatedData = await generatePlanClientSide(user!.id, config);
        return generatedData;
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks-range"] }); },
  });
}

async function generatePlanClientSide(
  userId: string,
  config: { examDate: string; dailyStudyHours: number; targetScore: number }
) {
  const [{ data: allTopics }, { data: progress }, { data: results }] = await Promise.all([
    supabase.from("topics").select("id, name, chapter_id").order("order"),
    supabase.from("topic_progress").select("topic_id, topic_test_passed").eq("user_id", userId),
    supabase.from("exam_results").select("exam_id, accuracy").eq("user_id", userId),
  ]);

  const progressMap = new Map((progress ?? []).map((p) => [p.topic_id, p]));
  const completedTopicIds = new Set((progress ?? []).filter((p) => p.topic_test_passed).map((p) => p.topic_id));

  const { data: topicExams } = await supabase.from("exams").select("id, topic_id, type").in("type", ["lecture_quiz", "dpp", "pyq", "topic_test"]);
  const topicAccuracy = new Map<string, number[]>();
  for (const r of results ?? []) {
    const exam = topicExams?.find((e) => e.id === r.exam_id);
    if (exam?.topic_id) {
      const existing = topicAccuracy.get(exam.topic_id) ?? [];
      topicAccuracy.set(exam.topic_id, [...existing, r.accuracy]);
    }
  }

  const incompletedTopics = (allTopics ?? []).filter((t) => !completedTopicIds.has(t.id));
  const weakTopics = incompletedTopics.filter((t) => {
    const accs = topicAccuracy.get(t.id) ?? [];
    if (accs.length === 0) return false;
    return accs.reduce((s, a) => s + a, 0) / accs.length < 60;
  });

  const examDate = new Date(config.examDate);
  examDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = Math.ceil((examDate.getTime() - today.getTime()) / 86400000);

  if (totalDays < 1) throw new Error("Exam date must be in the future");

  const revisionDays = Math.max(1, Math.ceil(totalDays * 0.2));
  const studyDays = totalDays - revisionDays;
  const topicsPerDay = Math.max(1, Math.ceil(config.dailyStudyHours / 2));

  await supabase.from("study_tasks").delete().eq("user_id", userId).eq("source", "auto");

  const tasksToInsert: Array<{
    user_id: string;
    title: string;
    status: "pending";
    source: "auto";
    topic_id: string | null;
    scheduled_date: string;
    sort_order: number;
  }> = [];

  let dayIndex = 0;
  let topicIndex = 0;
  const topicsToStudy = incompletedTopics;

  while (dayIndex < studyDays && topicIndex < topicsToStudy.length) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayIndex);
    const dateStr = date.toISOString().split("T")[0];

    for (let i = 0; i < topicsPerDay && topicIndex < topicsToStudy.length; i++) {
      const topic = topicsToStudy[topicIndex];
      tasksToInsert.push({
        user_id: userId,
        title: topic.name,
        status: "pending",
        source: "auto",
        topic_id: topic.id,
        scheduled_date: dateStr,
        sort_order: i,
      });
      topicIndex++;
    }
    dayIndex++;
  }

  if (config.targetScore >= 85 && weakTopics.length > 0) {
    for (let rd = 0; rd < revisionDays; rd++) {
      const date = new Date(today);
      date.setDate(today.getDate() + studyDays + rd);
      const dateStr = date.toISOString().split("T")[0];
      const dayWeakTopics = weakTopics.slice(rd * topicsPerDay, (rd + 1) * topicsPerDay);

      dayWeakTopics.forEach((t, i) => {
        tasksToInsert.push({
          user_id: userId,
          title: `[Revision] ${t.name}`,
          status: "pending",
          source: "auto",
          topic_id: t.id,
          scheduled_date: dateStr,
          sort_order: i,
        });
      });
    }
  }

  if (tasksToInsert.length > 0) {
    const BATCH = 50;
    for (let i = 0; i < tasksToInsert.length; i += BATCH) {
      const { error } = await supabase.from("study_tasks").insert(tasksToInsert.slice(i, i + BATCH));
      if (error) throw error;
    }
  }

  const dateSet = new Set(tasksToInsert.map((t) => t.scheduled_date));

  return {
    tasksCreated: tasksToInsert.length,
    daysPlanned: dateSet.size,
    topicsCovered: topicIndex,
    totalTopics: allTopics?.length ?? 0,
    completedTopics: completedTopicIds.size,
    weakTopicsFound: weakTopics.length,
    examDate: config.examDate,
    daysUntilExam: totalDays,
    revisionDays: config.targetScore >= 85 ? revisionDays : 0,
    firstTaskDate: tasksToInsert[0]?.scheduled_date ?? null,
    lastTaskDate: tasksToInsert[tasksToInsert.length - 1]?.scheduled_date ?? null,
  };
}

export function useListExternalTests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["external-tests", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_tests")
        .select("*")
        .eq("user_id", user!.id)
        .order("attempted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id,
        examName: t.exam_name,
        examType: t.exam_type,
        score: t.score,
        maxScore: t.max_score,
        totalQuestions: t.total_questions,
        correctAnswers: t.correct_answers,
        incorrectAnswers: t.incorrect_answers,
        skippedAnswers: t.skipped_answers,
        rank: t.rank,
        percentile: t.percentile,
        attemptedAt: t.attempted_at,
        notes: t.notes,
        createdAt: t.created_at,
      }));
    },
  });
}

export function useCreateExternalTest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      examName: string; examType: string; score: number; maxScore: number;
      totalQuestions?: number; correctAnswers?: number; incorrectAnswers?: number;
      skippedAnswers?: number; rank?: number; percentile?: number;
      attemptedAt: string; notes?: string;
    }) => {
      const { error } = await supabase.from("external_tests").insert({
        user_id: user!.id,
        exam_name: data.examName,
        exam_type: data.examType,
        score: data.score,
        max_score: data.maxScore,
        total_questions: data.totalQuestions ?? null,
        correct_answers: data.correctAnswers ?? null,
        incorrect_answers: data.incorrectAnswers ?? null,
        skipped_answers: data.skippedAnswers ?? null,
        rank: data.rank ?? null,
        percentile: data.percentile ?? null,
        attempted_at: data.attemptedAt,
        notes: data.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["external-tests"] }); },
  });
}

export function useDeleteExternalTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["external-tests"] }); },
  });
}

export function useListQrScans() {
  return useQuery({
    queryKey: ["qr-scans"],
    queryFn: async () => {
      const { data: scans, error } = await supabase
        .from("qr_scan_logs")
        .select("id, question_id, user_id, scanned_at, exam_id")
        .order("scanned_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const userIds = [...new Set((scans ?? []).map((s) => s.user_id))];
      const { data: users } = userIds.length > 0
        ? await supabase.from("users").select("id, full_name").in("id", userIds)
        : { data: [] };
      const userMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));

      return (scans ?? []).map((s) => ({
        id: s.id,
        questionId: s.question_id,
        userId: s.user_id,
        userName: userMap.get(s.user_id) ?? null,
        scannedAt: s.scanned_at,
        examId: s.exam_id,
      }));
    },
  });
}
