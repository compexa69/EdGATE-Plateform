import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubjectWithProgress {
  id: string;
  name: string;
  description: string | null;
  order: number;
  progressPercent: number;
  completedChapters: number;
  totalChapters: number;
  gateStatus: "locked" | "in_progress" | "completed";
  subjectTestUnlocked: boolean;
  subjectTestExamId: string | null;
}

export interface ChapterWithProgress {
  id: string;
  subjectId: string;
  name: string;
  description: string | null;
  order: number;
  progressPercent: number;
  completedTopics: number;
  totalTopics: number;
  gateStatus: "locked" | "in_progress" | "completed";
  chapterTestUnlocked: boolean;
  chapterTestExamId: string | null;
  notesUploadUnlocked: boolean;
}

export interface TopicWithProgress {
  id: string;
  chapterId: string;
  name: string;
  description: string | null;
  order: number;
  telegramChatId: string | null;
  telegramMessageId: string | null;
  telegramUrl: string | null;
  youtubeUrl: string | null;
  gateStatus: "locked" | "in_progress" | "completed";
  lectureQuizPassed: boolean;
  dppCompleted: boolean;
  pyqCompleted: boolean;
  topicTestPassed: boolean;
  availableExams: Array<{ id: string; type: string; title: string }>;
}

// ─── Subjects ────────────────────────────────────────────────────────────────

export function useListSubjects() {
  const { user } = useAuth();
  return useQuery<SubjectWithProgress[]>({
    queryKey: ["subjects", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const [
        { data: subjects },
        { data: chapters },
        { data: topics },
        { data: progress },
        { data: exams },
        { data: results },
      ] = await Promise.all([
        supabase.from("subjects").select("id, name, description, order").order("order"),
        supabase.from("chapters").select("id, subject_id").order("order"),
        supabase.from("topics").select("id, chapter_id").order("order"),
        supabase.from("topic_progress").select("topic_id, lecture_quiz_passed, dpp_completed, pyq_completed, topic_test_passed").eq("user_id", user!.id),
        supabase.from("exams").select("id, type, subject_id").in("type", ["subject_test"]),
        supabase.from("exam_results").select("exam_id, passed").eq("user_id", user!.id),
      ]);

      const progressMap = new Map((progress ?? []).map((p) => [p.topic_id, p]));
      const resultMap = new Map((results ?? []).map((r) => [r.exam_id, r]));
      const chaptersBySubject = new Map<string, string[]>();
      const topicsByChapter = new Map<string, string[]>();

      for (const ch of chapters ?? []) {
        if (!chaptersBySubject.has(ch.subject_id)) chaptersBySubject.set(ch.subject_id, []);
        chaptersBySubject.get(ch.subject_id)!.push(ch.id);
      }
      for (const t of topics ?? []) {
        if (!topicsByChapter.has(t.chapter_id)) topicsByChapter.set(t.chapter_id, []);
        topicsByChapter.get(t.chapter_id)!.push(t.id);
      }

      return (subjects ?? []).map((subject, subIdx) => {
        const subChapters = chaptersBySubject.get(subject.id) ?? [];
        let completedChapters = 0;
        let totalTopics = 0;
        let completedTopics = 0;

        for (const chId of subChapters) {
          const chTopics = topicsByChapter.get(chId) ?? [];
          totalTopics += chTopics.length;
          const allTopicsDone = chTopics.length > 0 && chTopics.every((tId) => {
            const p = progressMap.get(tId);
            return p?.topic_test_passed;
          });
          if (allTopicsDone) completedChapters++;
          completedTopics += chTopics.filter((tId) => progressMap.get(tId)?.topic_test_passed).length;
        }

        const progressPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
        const prevSubjectId = subIdx > 0 ? subjects![subIdx - 1].id : null;
        const prevDone = prevSubjectId ? (chaptersBySubject.get(prevSubjectId) ?? []).every((chId) => {
          const chTopics = topicsByChapter.get(chId) ?? [];
          return chTopics.length > 0 && chTopics.every((tId) => progressMap.get(tId)?.topic_test_passed);
        }) : true;

        const isCompleted = completedChapters === subChapters.length && subChapters.length > 0;
        const gateStatus: "locked" | "in_progress" | "completed" = !prevDone && subIdx > 0
          ? "locked"
          : isCompleted ? "completed" : "in_progress";

        const subjectTestExam = (exams ?? []).find((e) => e.subject_id === subject.id && e.type === "subject_test");
        const subjectTestUnlocked = isCompleted;
        const subjectTestResult = subjectTestExam ? resultMap.get(subjectTestExam.id) : null;

        return {
          id: subject.id,
          name: subject.name,
          description: subject.description,
          order: subject.order,
          progressPercent,
          completedChapters,
          totalChapters: subChapters.length,
          gateStatus,
          subjectTestUnlocked,
          subjectTestExamId: subjectTestExam?.id ?? null,
        };
      });
    },
  });
}

export function useGetSubject(subjectId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["subject", subjectId, user?.id],
    enabled: !!subjectId && !!user?.id,
    queryFn: async () => {
      const [
        { data: subject },
        { data: chapters },
        { data: topics },
        { data: progress },
        { data: exams },
        { data: results },
      ] = await Promise.all([
        supabase.from("subjects").select("*").eq("id", subjectId).single(),
        supabase.from("chapters").select("id").eq("subject_id", subjectId).order("order"),
        supabase.from("topics").select("id, chapter_id").order("order"),
        supabase.from("topic_progress").select("topic_id, topic_test_passed").eq("user_id", user!.id),
        supabase.from("exams").select("id, type, subject_id").eq("subject_id", subjectId).eq("type", "subject_test"),
        supabase.from("exam_results").select("exam_id, passed").eq("user_id", user!.id),
      ]);

      if (!subject) return null;
      const progressMap = new Map((progress ?? []).map((p) => [p.topic_id, p]));
      const chapterTopics = new Map<string, string[]>();
      for (const t of topics ?? []) {
        if (!chapterTopics.has(t.chapter_id)) chapterTopics.set(t.chapter_id, []);
        chapterTopics.get(t.chapter_id)!.push(t.id);
      }

      const chIds = (chapters ?? []).map((c) => c.id);
      let totalTopics = 0;
      let completedTopics = 0;
      let completedChapters = 0;
      for (const chId of chIds) {
        const chT = chapterTopics.get(chId) ?? [];
        totalTopics += chT.length;
        const done = chT.filter((id) => progressMap.get(id)?.topic_test_passed).length;
        completedTopics += done;
        if (chT.length > 0 && done === chT.length) completedChapters++;
      }

      const progressPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
      const isCompleted = completedChapters === chIds.length && chIds.length > 0;
      const subjectTestExam = exams?.[0] ?? null;
      const resultMap = new Map((results ?? []).map((r) => [r.exam_id, r]));

      return {
        id: subject.id,
        name: subject.name,
        description: subject.description,
        order: subject.order,
        progressPercent,
        completedChapters,
        totalChapters: chIds.length,
        gateStatus: isCompleted ? "completed" : "in_progress",
        subjectTestUnlocked: isCompleted,
        subjectTestExamId: subjectTestExam?.id ?? null,
      } as SubjectWithProgress;
    },
  });
}

// ─── Chapters ────────────────────────────────────────────────────────────────

export function useListChapters(subjectId: string) {
  const { user } = useAuth();
  return useQuery<ChapterWithProgress[]>({
    queryKey: ["chapters", subjectId, user?.id],
    enabled: !!subjectId && !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const [
        { data: chapters },
        { data: topics },
        { data: progress },
        { data: chapterExams },
        { data: results },
      ] = await Promise.all([
        supabase.from("chapters").select("*").eq("subject_id", subjectId).order("order"),
        supabase.from("topics").select("id, chapter_id").order("order"),
        supabase.from("topic_progress").select("topic_id, lecture_quiz_passed, dpp_completed, pyq_completed, topic_test_passed").eq("user_id", user!.id),
        supabase.from("exams").select("id, type, chapter_id").eq("subject_id", subjectId).in("type", ["chapter_test"]),
        supabase.from("exam_results").select("exam_id, passed").eq("user_id", user!.id),
      ]);

      const progressMap = new Map((progress ?? []).map((p) => [p.topic_id, p]));
      const topicsByChapter = new Map<string, string[]>();
      for (const t of topics ?? []) {
        if (!topicsByChapter.has(t.chapter_id)) topicsByChapter.set(t.chapter_id, []);
        topicsByChapter.get(t.chapter_id)!.push(t.id);
      }
      const resultMap = new Map((results ?? []).map((r) => [r.exam_id, r]));

      return (chapters ?? []).map((chapter, idx) => {
        const chTopics = topicsByChapter.get(chapter.id) ?? [];
        const completedTopics = chTopics.filter((id) => progressMap.get(id)?.topic_test_passed).length;
        const totalTopics = chTopics.length;
        const progressPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
        const allTopicsDone = totalTopics > 0 && completedTopics === totalTopics;

        const prevChapter = idx > 0 ? chapters![idx - 1] : null;
        const prevChTopics = prevChapter ? (topicsByChapter.get(prevChapter.id) ?? []) : [];
        const prevDone = !prevChapter || (prevChTopics.length > 0 && prevChTopics.every((id) => progressMap.get(id)?.topic_test_passed));

        const gateStatus: "locked" | "in_progress" | "completed" = !prevDone && idx > 0
          ? "locked"
          : allTopicsDone ? "completed" : "in_progress";

        const chapterTestExam = (chapterExams ?? []).find((e) => e.chapter_id === chapter.id);
        const chapterTestUnlocked = allTopicsDone;
        const chapterTestResult = chapterTestExam ? resultMap.get(chapterTestExam.id) : null;
        const notesUploadUnlocked = !!(chapterTestResult);

        return {
          id: chapter.id,
          subjectId: chapter.subject_id,
          name: chapter.name,
          description: chapter.description,
          order: chapter.order,
          progressPercent,
          completedTopics,
          totalTopics,
          gateStatus,
          chapterTestUnlocked,
          chapterTestExamId: chapterTestExam?.id ?? null,
          notesUploadUnlocked,
        };
      });
    },
  });
}

export function useGetChapter(chapterId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chapter", chapterId, user?.id],
    enabled: !!chapterId && !!user?.id,
    queryFn: async () => {
      const [
        { data: chapter },
        { data: topics },
        { data: progress },
        { data: chapterExams },
        { data: results },
      ] = await Promise.all([
        supabase.from("chapters").select("*").eq("id", chapterId).single(),
        supabase.from("topics").select("id").eq("chapter_id", chapterId).order("order"),
        supabase.from("topic_progress").select("topic_id, topic_test_passed").eq("user_id", user!.id),
        supabase.from("exams").select("id, type, chapter_id").eq("chapter_id", chapterId).eq("type", "chapter_test"),
        supabase.from("exam_results").select("exam_id, passed").eq("user_id", user!.id),
      ]);

      if (!chapter) return null;
      const progressMap = new Map((progress ?? []).map((p) => [p.topic_id, p]));
      const chTopics = (topics ?? []).map((t) => t.id);
      const completedTopics = chTopics.filter((id) => progressMap.get(id)?.topic_test_passed).length;
      const allTopicsDone = chTopics.length > 0 && completedTopics === chTopics.length;
      const chapterTestExam = chapterExams?.[0] ?? null;
      const resultMap = new Map((results ?? []).map((r) => [r.exam_id, r]));
      const chapterTestResult = chapterTestExam ? resultMap.get(chapterTestExam.id) : null;

      return {
        id: chapter.id,
        subjectId: chapter.subject_id,
        name: chapter.name,
        description: chapter.description,
        order: chapter.order,
        completedTopics,
        totalTopics: chTopics.length,
        progressPercent: chTopics.length > 0 ? Math.round((completedTopics / chTopics.length) * 100) : 0,
        gateStatus: allTopicsDone ? "completed" : "in_progress",
        chapterTestUnlocked: allTopicsDone,
        chapterTestExamId: chapterTestExam?.id ?? null,
        notesUploadUnlocked: !!chapterTestResult,
      } as ChapterWithProgress;
    },
  });
}

// ─── Topics ──────────────────────────────────────────────────────────────────

export function useListTopics(chapterId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["topics", chapterId, user?.id],
    enabled: !!chapterId && !!user?.id,
    queryFn: async () => {
      const [{ data: topics }, { data: progress }] = await Promise.all([
        supabase.from("topics").select("*").eq("chapter_id", chapterId).order("order"),
        supabase.from("topic_progress").select("*").eq("user_id", user!.id),
      ]);

      const progressMap = new Map((progress ?? []).map((p) => [p.topic_id, p]));

      return (topics ?? []).map((topic, idx) => {
        const p = progressMap.get(topic.id);
        const prevTopic = idx > 0 ? topics![idx - 1] : null;
        const prevDone = !prevTopic || progressMap.get(prevTopic.id)?.topic_test_passed;

        const isCompleted = !!p?.topic_test_passed;
        const gateStatus: "locked" | "in_progress" | "completed" = !prevDone && idx > 0
          ? "locked"
          : isCompleted ? "completed" : "in_progress";

        return {
          id: topic.id,
          name: topic.name,
          gateStatus,
          lectureQuizPassed: !!p?.lecture_quiz_passed,
          dppCompleted: !!p?.dpp_completed,
          pyqCompleted: !!p?.pyq_completed,
          topicTestPassed: !!p?.topic_test_passed,
        };
      });
    },
  });
}

export function useGetTopic(topicId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["topic", topicId, user?.id],
    enabled: !!topicId && !!user?.id,
    queryFn: async () => {
      const [{ data: topic }, { data: progress }, { data: exams }] = await Promise.all([
        supabase.from("topics").select("*").eq("id", topicId).single(),
        supabase.from("topic_progress").select("*").eq("user_id", user!.id).eq("topic_id", topicId).maybeSingle(),
        supabase.from("exams").select("id, type, title").eq("topic_id", topicId).in("type", ["lecture_quiz", "dpp", "pyq", "topic_test"]),
      ]);

      if (!topic) return null;

      return {
        id: topic.id,
        chapterId: topic.chapter_id,
        name: topic.name,
        description: topic.description,
        order: topic.order,
        telegramChatId: topic.telegram_chat_id,
        telegramMessageId: topic.telegram_message_id,
        telegramUrl: topic.telegram_url,
        youtubeUrl: topic.youtube_url,
        lectureQuizPassed: !!progress?.lecture_quiz_passed,
        dppCompleted: !!progress?.dpp_completed,
        pyqCompleted: !!progress?.pyq_completed,
        topicTestPassed: !!progress?.topic_test_passed,
        availableExams: (exams ?? []).map((e) => ({ id: e.id, type: e.type, title: e.title })),
      } as TopicWithProgress;
    },
  });
}

export function useRecordLectureClick() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (topicId: string) => {
      const { data: existing } = await supabase
        .from("topic_progress")
        .select("id, lecture_click_count")
        .eq("user_id", user!.id)
        .eq("topic_id", topicId)
        .maybeSingle();

      if (existing) {
        await supabase.from("topic_progress").update({ lecture_click_count: existing.lecture_click_count + 1 }).eq("id", existing.id);
      } else {
        await supabase.from("topic_progress").insert({ user_id: user!.id, topic_id: topicId, lecture_click_count: 1 });
      }
    },
    onSuccess: (_d, topicId) => {
      qc.invalidateQueries({ queryKey: ["topic", topicId] });
    },
  });
}

export function useCheckGate() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ targetId, targetType }: { targetId: string; targetType: string }) => {
      const { data: exam } = await supabase.from("exams").select("id, type, topic_id").eq("id", targetId).single();
      if (!exam || !exam.topic_id) return { allowed: true };

      const { data: progress } = await supabase
        .from("topic_progress")
        .select("*")
        .eq("user_id", user!.id)
        .eq("topic_id", exam.topic_id)
        .maybeSingle();

      if (targetType === "lecture_quiz") return { allowed: true };
      if (targetType === "dpp") {
        if (!progress?.lecture_quiz_passed) return { allowed: false, reason: "Complete the Lecture Quiz first." };
      }
      if (targetType === "pyq") {
        if (!progress?.dpp_completed) return { allowed: false, reason: "Complete the DPP first." };
      }
      if (targetType === "topic_test") {
        if (!progress?.pyq_completed) return { allowed: false, reason: "Complete the PYQ first." };
      }
      return { allowed: true };
    },
  });
}

export function useGetUploadUrl() {
  return useMutation({
    mutationFn: async (params: { fileName: string; fileSizeBytes: number; chapterId: string }) => {
      const { data, error } = await supabase.functions.invoke("b2-presign", {
        body: { action: "upload", fileName: params.fileName, chapterId: params.chapterId },
      });
      if (error) throw error;
      return data as { uploadUrl: string; b2Key: string };
    },
  });
}

export function useConfirmUpload() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { b2Key: string; fileName: string; fileSizeBytes: number; chapterId: string }) => {
      const { error } = await supabase.from("notes").insert({
        user_id: user!.id,
        chapter_id: params.chapterId,
        file_name: params.fileName,
        file_size_bytes: params.fileSizeBytes,
        b2_key: params.b2Key,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useGetInlineNote(topicId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inline-note", topicId, user?.id],
    enabled: !!topicId && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inline_notes")
        .select("content")
        .eq("user_id", user!.id)
        .eq("topic_id", topicId)
        .maybeSingle();
      return data ?? { content: "" };
    },
  });
}

export function useSaveInlineNote() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ topicId, content }: { topicId: string; content: string }) => {
      const { error } = await supabase.from("inline_notes").upsert(
        { user_id: user!.id, topic_id: topicId, content },
        { onConflict: "user_id,topic_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["inline-note", vars.topicId] });
    },
  });
}

// Admin CRUD
export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; order?: number }) => {
      const { data: result, error } = await supabase.from("subjects").insert(data).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); },
  });
}

export function useUpdateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; order?: number }) => {
      const { error } = await supabase.from("subjects").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); },
  });
}

export function useDeleteSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); },
  });
}

export function useCreateChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { subject_id: string; name: string; description?: string; order?: number }) => {
      const { data: result, error } = await supabase.from("chapters").insert(data).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["chapters"] }); },
  });
}

export function useUpdateChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; order?: number }) => {
      const { error } = await supabase.from("chapters").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["chapters"] }); },
  });
}

export function useDeleteChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chapters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["chapters"] }); },
  });
}

export function useCreateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { chapter_id: string; name: string; description?: string; order?: number; telegram_url?: string; youtube_url?: string }) => {
      const { data: result, error } = await supabase.from("topics").insert(data).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["topics"] }); },
  });
}

export function useUpdateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; order?: number; telegram_url?: string; youtube_url?: string }) => {
      const { error } = await supabase.from("topics").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["topics"] }); },
  });
}

export function useDeleteTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["topics"] }); },
  });
}

export function useAdminListChapters(subjectId: string) {
  return useQuery({
    queryKey: ["admin-chapters", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("chapters").select("*").eq("subject_id", subjectId).order("order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminListTopics(chapterId: string) {
  return useQuery({
    queryKey: ["admin-topics", chapterId],
    enabled: !!chapterId,
    queryFn: async () => {
      const { data, error } = await supabase.from("topics").select("*").eq("chapter_id", chapterId).order("order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminListSubjects() {
  return useQuery({
    queryKey: ["admin-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("order");
      if (error) throw error;
      return data ?? [];
    },
  });
}
