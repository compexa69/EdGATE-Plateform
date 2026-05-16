import { Router, type IRouter } from "express";
import { db, chaptersTable, topicsTable, topicProgressTable, examsTable, examResultsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ListChaptersParams,
  CreateChapterParams,
  CreateChapterBody,
  GetChapterParams,
  UpdateChapterParams,
  UpdateChapterBody,
} from "@workspace/api-zod";
import { requireApproved, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

async function buildChapterResponse(ch: typeof chaptersTable.$inferSelect, userId: string) {
  const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, ch.id));
  let completedTopics = 0;
  for (const t of topics) {
    const [prog] = await db.select().from(topicProgressTable)
      .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, userId)));
    if (prog?.topicTestPassed) completedTopics++;
  }
  const progressPercent = topics.length > 0 ? Math.round((completedTopics / topics.length) * 100) : 0;
  const allComplete = topics.length > 0 && completedTopics === topics.length;

  const [chapterExam] = await db.select().from(examsTable)
    .where(and(eq(examsTable.chapterId, ch.id), eq(examsTable.type, "chapter_test")));
  let chapterTestAttempted = false;
  if (chapterExam) {
    const [result] = await db.select().from(examResultsTable)
      .where(and(eq(examResultsTable.examId, chapterExam.id), eq(examResultsTable.userId, userId)));
    chapterTestAttempted = !!result;
  }

  return {
    id: ch.id,
    subjectId: ch.subjectId,
    name: ch.name,
    description: ch.description ?? null,
    order: ch.order,
    totalTopics: topics.length,
    completedTopics,
    progressPercent,
    gateStatus: allComplete ? "completed" : "unlocked",
    chapterTestUnlocked: allComplete,
    notesUploadUnlocked: chapterTestAttempted,
  };
}

router.get("/subjects/:subjectId/chapters", requireApproved, async (req, res): Promise<void> => {
  const params = ListChaptersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const chapters = await db.select().from(chaptersTable)
    .where(eq(chaptersTable.subjectId, params.data.subjectId))
    .orderBy(chaptersTable.order);

  const result = await Promise.all(chapters.map((ch) => buildChapterResponse(ch, req.user!.id)));
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

  const [chapter] = await db.insert(chaptersTable).values({
    id: nanoid(),
    subjectId: params.data.subjectId,
    ...parsed.data,
  }).returning();

  res.status(201).json({
    id: chapter.id, subjectId: chapter.subjectId, name: chapter.name,
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

  const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, params.data.chapterId));
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  const topics = await db.select().from(topicsTable)
    .where(eq(topicsTable.chapterId, chapter.id))
    .orderBy(topicsTable.order);

  const topicsWithProgress = await Promise.all(topics.map(async (t) => {
    const [prog] = await db.select().from(topicProgressTable)
      .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, req.user!.id)));
    return {
      id: t.id, chapterId: t.chapterId, name: t.name,
      description: t.description ?? null, order: t.order,
      telegramChatId: t.telegramChatId ?? null,
      telegramMessageId: t.telegramMessageId ?? null,
      lectureQuizPassed: prog?.lectureQuizPassed ?? false,
      dppCompleted: prog?.dppCompleted ?? false,
      pyqCompleted: prog?.pyqCompleted ?? false,
      topicTestPassed: prog?.topicTestPassed ?? false,
      isComplete: prog?.topicTestPassed ?? false,
      gateStatus: prog?.topicTestPassed ? "completed" : "unlocked",
      lectureClickCount: prog?.lectureClickCount ?? 0,
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

  const [chapter] = await db.update(chaptersTable)
    .set(parsed.data)
    .where(eq(chaptersTable.id, params.data.chapterId))
    .returning();

  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }

  res.json({
    id: chapter.id, subjectId: chapter.subjectId, name: chapter.name,
    description: chapter.description ?? null, order: chapter.order,
    totalTopics: 0, completedTopics: 0, progressPercent: 0,
    gateStatus: "unlocked", chapterTestUnlocked: false, notesUploadUnlocked: false,
  });
});

export default router;
