import { Router, type IRouter } from "express";
import { db, topicsTable, topicProgressTable, examsTable, examQuestionsTable, examResultsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
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

const router: IRouter = Router();

async function buildTopicResponse(t: typeof topicsTable.$inferSelect, userId: string) {
  const [prog] = await db.select().from(topicProgressTable)
    .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, userId)));

  return {
    id: t.id,
    chapterId: t.chapterId,
    name: t.name,
    description: t.description ?? null,
    order: t.order,
    telegramChatId: t.telegramChatId ?? null,
    telegramMessageId: t.telegramMessageId ?? null,
    telegramUrl: t.telegramUrl ?? null,
    youtubeUrl: t.youtubeUrl ?? null,
    lectureQuizPassed: prog?.lectureQuizPassed ?? false,
    dppCompleted: prog?.dppCompleted ?? false,
    pyqCompleted: prog?.pyqCompleted ?? false,
    topicTestPassed: prog?.topicTestPassed ?? false,
    isComplete: prog?.topicTestPassed ?? false,
    gateStatus: prog?.topicTestPassed ? "completed" : "unlocked",
    lectureClickCount: prog?.lectureClickCount ?? 0,
  };
}

router.get("/chapters/:chapterId/topics", requireApproved, async (req, res): Promise<void> => {
  const params = ListTopicsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const topics = await db.select().from(topicsTable)
    .where(eq(topicsTable.chapterId, params.data.chapterId))
    .orderBy(topicsTable.order);

  const result = await Promise.all(topics.map((t) => buildTopicResponse(t, req.user!.id)));
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

  const [topic] = await db.insert(topicsTable).values({
    id: nanoid(),
    chapterId: params.data.chapterId,
    ...parsed.data,
  }).returning();

  res.status(201).json({
    id: topic.id, chapterId: topic.chapterId, name: topic.name,
    description: topic.description ?? null, order: topic.order,
    telegramChatId: topic.telegramChatId ?? null,
    telegramMessageId: topic.telegramMessageId ?? null,
    telegramUrl: topic.telegramUrl ?? null,
    youtubeUrl: topic.youtubeUrl ?? null,
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

  const [topic] = await db.select().from(topicsTable).where(eq(topicsTable.id, params.data.topicId));
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  const base = await buildTopicResponse(topic, req.user!.id);
  const availableExams = await db.select().from(examsTable)
    .where(eq(examsTable.topicId, topic.id));

  const enrichedExams = await Promise.all(availableExams.map(async (e) => {
    const examQs = await db.select({ id: examQuestionsTable.id })
      .from(examQuestionsTable).where(eq(examQuestionsTable.examId, e.id));
    const totalQuestions = examQs.length;

    const [lastResult] = await db.select()
      .from(examResultsTable)
      .where(and(eq(examResultsTable.examId, e.id), eq(examResultsTable.userId, req.user!.id)))
      .orderBy(desc(examResultsTable.submittedAt))
      .limit(1);
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
      subjectId: e.subjectId ?? null, chapterId: e.chapterId ?? null, topicId: e.topicId ?? null,
      durationMinutes: e.durationMinutes, totalQuestions, totalMarks: totalQuestions,
      passingScore: e.passingScore ?? null, negativeMarking: e.negativeMarking,
      isUnlocked, hasAttempted, lastScore,
      createdAt: e.createdAt.toISOString(),
    };
  }));

  res.json({
    ...base,
    availableExams: enrichedExams,
  });
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

  const [topic] = await db.update(topicsTable)
    .set(parsed.data)
    .where(eq(topicsTable.id, params.data.topicId))
    .returning();

  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  res.json({
    id: topic.id, chapterId: topic.chapterId, name: topic.name,
    description: topic.description ?? null, order: topic.order,
    telegramChatId: topic.telegramChatId ?? null,
    telegramMessageId: topic.telegramMessageId ?? null,
    telegramUrl: topic.telegramUrl ?? null,
    youtubeUrl: topic.youtubeUrl ?? null,
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

  await db.delete(topicsTable).where(eq(topicsTable.id, params.data.topicId));
  res.sendStatus(204);
});

router.post("/topics/:topicId/lecture-click", requireApproved, async (req, res): Promise<void> => {
  const params = RecordLectureClickParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(topicProgressTable)
    .where(and(eq(topicProgressTable.topicId, params.data.topicId), eq(topicProgressTable.userId, req.user!.id)));

  if (existing) {
    await db.update(topicProgressTable)
      .set({ lectureClickCount: existing.lectureClickCount + 1 })
      .where(eq(topicProgressTable.id, existing.id));
  } else {
    await db.insert(topicProgressTable).values({
      id: nanoid(),
      userId: req.user!.id,
      topicId: params.data.topicId,
      lectureClickCount: 1,
    });
  }

  res.json({ success: true, message: "Lecture click recorded" });
});

export default router;
