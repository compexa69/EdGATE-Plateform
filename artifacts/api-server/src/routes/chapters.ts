import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import {
  ListChaptersParams,
  CreateChapterParams,
  CreateChapterBody,
  GetChapterParams,
  UpdateChapterParams,
  UpdateChapterBody,
  DeleteChapterParams,
} from "@workspace/api-zod";
import { requireApproved, requireAdmin } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

async function buildChapterResponse(ch: Record<string, any>, userId: string) {
  const { data: topics } = await supabase.from("topics").select("id").eq("chapter_id", ch.id);
  let completedTopics = 0;
  for (const t of topics ?? []) {
    const { data: prog } = await supabase.from("topic_progress")
      .select("topic_test_passed")
      .eq("topic_id", t.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (prog?.topic_test_passed) completedTopics++;
  }
  const totalTopics = topics?.length ?? 0;
  const progressPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
  const allComplete = totalTopics > 0 && completedTopics === totalTopics;

  const { data: chapterExam } = await supabase.from("exams")
    .select("id")
    .eq("chapter_id", ch.id)
    .eq("type", "chapter_test")
    .maybeSingle();
  let chapterTestAttempted = false;
  if (chapterExam) {
    const { data: result } = await supabase.from("exam_results")
      .select("id")
      .eq("exam_id", chapterExam.id)
      .eq("user_id", userId)
      .maybeSingle();
    chapterTestAttempted = !!result;
  }

  return {
    id: ch.id,
    subjectId: ch.subject_id,
    name: ch.name,
    description: ch.description ?? null,
    order: ch.order,
    totalTopics,
    completedTopics,
    progressPercent,
    gateStatus: allComplete ? "completed" : "unlocked",
    chapterTestUnlocked: allComplete,
    chapterTestExamId: chapterExam?.id ?? null,
    notesUploadUnlocked: chapterTestAttempted,
  };
}

router.get("/subjects/:subjectId/chapters", requireApproved, async (req, res): Promise<void> => {
  const params = ListChaptersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { data: chapters } = await supabase.from("chapters")
    .select("*")
    .eq("subject_id", params.data.subjectId)
    .order("order");

  const result = await Promise.all((chapters ?? []).map((ch) => buildChapterResponse(ch, req.user!.id)));
  res.json(result);
});

router.post("/subjects/:subjectId/chapters", requireAdmin, async (req, res): Promise<void> => {
  const params = CreateChapterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateChapterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data: chapter } = await supabase.from("chapters").insert({
    id: nanoid(),
    subject_id: params.data.subjectId,
    name: parsed.data.name,
    description: (parsed.data as any).description ?? null,
    order: parsed.data.order,
  }).select().single();

  res.status(201).json({
    id: chapter.id, subjectId: chapter.subject_id, name: chapter.name,
    description: chapter.description ?? null, order: chapter.order,
    totalTopics: 0, completedTopics: 0, progressPercent: 0,
    gateStatus: "unlocked", chapterTestUnlocked: false, notesUploadUnlocked: false,
  });
});

router.get("/chapters/:chapterId", requireApproved, async (req, res): Promise<void> => {
  const params = GetChapterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data: chapter } = await supabase.from("chapters").select("*").eq("id", params.data.chapterId).maybeSingle();
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  const { data: topics } = await supabase.from("topics").select("*").eq("chapter_id", chapter.id).order("order");

  const topicsWithProgress = await Promise.all((topics ?? []).map(async (t) => {
    const { data: prog } = await supabase.from("topic_progress")
      .select("*")
      .eq("topic_id", t.id)
      .eq("user_id", req.user!.id)
      .maybeSingle();
    return {
      id: t.id, chapterId: t.chapter_id, name: t.name,
      description: t.description ?? null, order: t.order,
      telegramChatId: t.telegram_chat_id ?? null,
      telegramMessageId: t.telegram_message_id ?? null,
      lectureQuizPassed: prog?.lecture_quiz_passed ?? false,
      dppCompleted: prog?.dpp_completed ?? false,
      pyqCompleted: prog?.pyq_completed ?? false,
      topicTestPassed: prog?.topic_test_passed ?? false,
      isComplete: prog?.topic_test_passed ?? false,
      gateStatus: prog?.topic_test_passed ? "completed" : "unlocked",
      lectureClickCount: prog?.lecture_click_count ?? 0,
    };
  }));

  const chapterData = await buildChapterResponse(chapter, req.user!.id);
  res.json({ ...chapterData, topics: topicsWithProgress });
});

router.patch("/chapters/:chapterId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateChapterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateChapterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, any> = {};
  if ((parsed.data as any).name != null) updates.name = (parsed.data as any).name;
  if ((parsed.data as any).description != null) updates.description = (parsed.data as any).description;
  if ((parsed.data as any).order != null) updates.order = (parsed.data as any).order;

  const { data: chapter } = await supabase.from("chapters")
    .update(updates)
    .eq("id", params.data.chapterId)
    .select()
    .maybeSingle();

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  res.json({
    id: chapter.id, subjectId: chapter.subject_id, name: chapter.name,
    description: chapter.description ?? null, order: chapter.order,
    totalTopics: 0, completedTopics: 0, progressPercent: 0,
    gateStatus: "unlocked", chapterTestUnlocked: false, chapterTestExamId: null, notesUploadUnlocked: false,
  });
});

router.delete("/chapters/:chapterId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteChapterParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await supabase.from("chapters").delete().eq("id", params.data.chapterId);
  res.sendStatus(204);
});

export default router;
