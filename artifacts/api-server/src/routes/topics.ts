import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import {
  ListTopicsParams,
  CreateTopicParams,
  CreateTopicBody,
  GetTopicParams,
  UpdateTopicParams,
  UpdateTopicBody,
  RecordLectureClickParams,
  DeleteTopicParams,
} from "@workspace/api-zod";
import { requireApproved, requireAdmin } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

async function buildTopicResponse(t: Record<string, any>, userId: string) {
  const { data: prog } = await supabase.from("topic_progress")
    .select("*")
    .eq("topic_id", t.id)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    id: t.id,
    chapterId: t.chapter_id,
    name: t.name,
    description: t.description ?? null,
    order: t.order,
    telegramChatId: t.telegram_chat_id ?? null,
    telegramMessageId: t.telegram_message_id ?? null,
    telegramUrl: t.telegram_url ?? null,
    youtubeUrl: t.youtube_url ?? null,
    lectureQuizPassed: prog?.lecture_quiz_passed ?? false,
    dppCompleted: prog?.dpp_completed ?? false,
    pyqCompleted: prog?.pyq_completed ?? false,
    topicTestPassed: prog?.topic_test_passed ?? false,
    isComplete: prog?.topic_test_passed ?? false,
    gateStatus: prog?.topic_test_passed ? "completed" : "unlocked",
    lectureClickCount: prog?.lecture_click_count ?? 0,
  };
}

router.get("/chapters/:chapterId/topics", requireApproved, async (req, res): Promise<void> => {
  const params = ListTopicsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data: topics } = await supabase.from("topics")
    .select("*")
    .eq("chapter_id", params.data.chapterId)
    .order("order");

  const result = await Promise.all((topics ?? []).map((t) => buildTopicResponse(t, req.user!.id)));
  res.json(result);
});

router.post("/chapters/:chapterId/topics", requireAdmin, async (req, res): Promise<void> => {
  const params = CreateTopicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateTopicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data as any;
  const { data: topic } = await supabase.from("topics").insert({
    id: nanoid(),
    chapter_id: params.data.chapterId,
    name: d.name,
    description: d.description ?? null,
    order: d.order,
    telegram_chat_id: d.telegramChatId ?? null,
    telegram_message_id: d.telegramMessageId ?? null,
    telegram_url: d.telegramUrl ?? null,
    youtube_url: d.youtubeUrl ?? null,
  }).select().single();

  res.status(201).json({
    id: topic.id, chapterId: topic.chapter_id, name: topic.name,
    description: topic.description ?? null, order: topic.order,
    telegramChatId: topic.telegram_chat_id ?? null,
    telegramMessageId: topic.telegram_message_id ?? null,
    telegramUrl: topic.telegram_url ?? null,
    youtubeUrl: topic.youtube_url ?? null,
    lectureQuizPassed: false, dppCompleted: false, pyqCompleted: false,
    topicTestPassed: false, isComplete: false, gateStatus: "unlocked",
    lectureClickCount: 0,
  });
});

router.get("/topics/:topicId", requireApproved, async (req, res): Promise<void> => {
  const params = GetTopicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data: topic } = await supabase.from("topics").select("*").eq("id", params.data.topicId).maybeSingle();
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  const base = await buildTopicResponse(topic, req.user!.id);
  const { data: availableExams } = await supabase.from("exams").select("*").eq("topic_id", topic.id);

  const enrichedExams = await Promise.all((availableExams ?? []).map(async (e) => {
    const { count: totalQuestions } = await supabase.from("exam_questions")
      .select("*", { count: "exact", head: true })
      .eq("exam_id", e.id);

    const { data: lastResult } = await supabase.from("exam_results")
      .select("accuracy")
      .eq("exam_id", e.id)
      .eq("user_id", req.user!.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const hasAttempted = !!lastResult;
    const lastScore = lastResult ? lastResult.accuracy : null;

    let isUnlocked = false;
    if (e.type === "lecture_quiz") {
      isUnlocked = base.lectureClickCount > 0;
    } else if (e.type === "dpp") {
      isUnlocked = base.lectureQuizPassed;
    } else if (e.type === "pyq") {
      isUnlocked = base.dppCompleted;
    } else if (e.type === "topic_test") {
      isUnlocked = base.pyqCompleted;
    } else {
      isUnlocked = true;
    }

    return {
      id: e.id, title: e.title, type: e.type,
      subjectId: e.subject_id ?? null, chapterId: e.chapter_id ?? null, topicId: e.topic_id ?? null,
      durationMinutes: e.duration_minutes, totalQuestions: totalQuestions ?? 0, totalMarks: totalQuestions ?? 0,
      passingScore: e.passing_score ?? null, negativeMarking: e.negative_marking,
      isUnlocked, hasAttempted, lastScore,
      createdAt: e.created_at,
    };
  }));

  res.json({ ...base, availableExams: enrichedExams });
});

router.patch("/topics/:topicId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateTopicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTopicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data as any;
  const updates: Record<string, any> = {};
  if (d.name != null) updates.name = d.name;
  if (d.description != null) updates.description = d.description;
  if (d.order != null) updates.order = d.order;
  if (d.telegramChatId !== undefined) updates.telegram_chat_id = d.telegramChatId;
  if (d.telegramMessageId !== undefined) updates.telegram_message_id = d.telegramMessageId;
  if (d.telegramUrl !== undefined) updates.telegram_url = d.telegramUrl;
  if (d.youtubeUrl !== undefined) updates.youtube_url = d.youtubeUrl;

  const { data: topic } = await supabase.from("topics")
    .update(updates)
    .eq("id", params.data.topicId)
    .select()
    .maybeSingle();

  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  res.json({
    id: topic.id, chapterId: topic.chapter_id, name: topic.name,
    description: topic.description ?? null, order: topic.order,
    telegramChatId: topic.telegram_chat_id ?? null,
    telegramMessageId: topic.telegram_message_id ?? null,
    telegramUrl: topic.telegram_url ?? null,
    youtubeUrl: topic.youtube_url ?? null,
    lectureQuizPassed: false, dppCompleted: false, pyqCompleted: false,
    topicTestPassed: false, isComplete: false, gateStatus: "unlocked", lectureClickCount: 0,
  });
});

router.delete("/topics/:topicId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteTopicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await supabase.from("topics").delete().eq("id", params.data.topicId);
  res.sendStatus(204);
});

router.post("/topics/:topicId/lecture-click", requireApproved, async (req, res): Promise<void> => {
  const params = RecordLectureClickParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data: existing } = await supabase.from("topic_progress")
    .select("id, lecture_click_count")
    .eq("topic_id", params.data.topicId)
    .eq("user_id", req.user!.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("topic_progress")
      .update({ lecture_click_count: (existing.lecture_click_count ?? 0) + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("topic_progress").insert({
      id: nanoid(),
      user_id: req.user!.id,
      topic_id: params.data.topicId,
      lecture_click_count: 1,
    });
  }

  res.json({ success: true, message: "Lecture click recorded" });
});

export default router;
