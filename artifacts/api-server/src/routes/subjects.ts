import { Router, type IRouter } from "express";
import { db, subjectsTable, chaptersTable, topicsTable, topicProgressTable, examsTable, examResultsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  CreateSubjectBody,
  UpdateSubjectBody,
  GetSubjectParams,
  UpdateSubjectParams,
  DeleteSubjectParams,
} from "@workspace/api-zod";
import { requireAdmin, requireApproved } from "../lib/auth";

const router: IRouter = Router();

// ── Gate helpers ─────────────────────────────────────────────────────────────

/**
 * Subject Test is unlocked when every chapter in the subject has at least one
 * chapter_test exam result where passed = true.
 */
async function isSubjectTestUnlocked(subjectId: string, userId: string): Promise<boolean> {
  const chapters = await db.select().from(chaptersTable)
    .where(eq(chaptersTable.subjectId, subjectId));
  if (chapters.length === 0) return false;

  for (const ch of chapters) {
    const [chapterExam] = await db.select().from(examsTable)
      .where(and(eq(examsTable.chapterId, ch.id), eq(examsTable.type, "chapter_test")));
    if (!chapterExam) return false; // chapter has no test assigned yet

    const [passedResult] = await db.select().from(examResultsTable)
      .where(and(
        eq(examResultsTable.examId, chapterExam.id),
        eq(examResultsTable.userId, userId),
        eq(examResultsTable.passed, true),
      ));
    if (!passedResult) return false;
  }
  return true;
}

/** Returns the exam id for the subject-level test, if one exists. */
async function getSubjectTestExamId(subjectId: string): Promise<string | null> {
  const [exam] = await db.select().from(examsTable)
    .where(and(eq(examsTable.subjectId, subjectId), eq(examsTable.type, "subject_test")));
  return exam?.id ?? null;
}

// ── Progress helper ───────────────────────────────────────────────────────────

async function getSubjectWithProgress(subjectId: string, userId: string) {
  const chapters = await db.select().from(chaptersTable).where(eq(chaptersTable.subjectId, subjectId));
  let completedChapters = 0;
  for (const ch of chapters) {
    const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, ch.id));
    if (topics.length === 0) continue;
    let allComplete = true;
    for (const t of topics) {
      const [prog] = await db.select().from(topicProgressTable)
        .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, userId)));
      if (!prog || !prog.topicTestPassed) { allComplete = false; break; }
    }
    if (allComplete) completedChapters++;
  }
  return { totalChapters: chapters.length, completedChapters };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/subjects", requireApproved, async (req, res): Promise<void> => {
  const subjects = await db.select().from(subjectsTable).orderBy(subjectsTable.order);
  const result = await Promise.all(subjects.map(async (s) => {
    const { totalChapters, completedChapters } = await getSubjectWithProgress(s.id, req.user!.id);
    const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
    const subjectTestUnlocked = await isSubjectTestUnlocked(s.id, req.user!.id);
    const subjectTestExamId = await getSubjectTestExamId(s.id);
    return {
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      order: s.order,
      iconName: s.iconName ?? null,
      totalChapters,
      completedChapters,
      progressPercent,
      gateStatus: completedChapters === totalChapters && totalChapters > 0 ? "completed" : "unlocked",
      subjectTestUnlocked,
      subjectTestExamId,
      createdAt: s.createdAt.toISOString(),
    };
  }));
  res.json(result);
});

router.post("/subjects", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateSubjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [subject] = await db.insert(subjectsTable).values({
    id: nanoid(),
    ...parsed.data,
  }).returning();

  res.status(201).json({
    id: subject.id,
    name: subject.name,
    description: subject.description ?? null,
    order: subject.order,
    iconName: subject.iconName ?? null,
    totalChapters: 0,
    completedChapters: 0,
    progressPercent: 0,
    gateStatus: "unlocked",
    subjectTestUnlocked: false,
    subjectTestExamId: null,
    createdAt: subject.createdAt.toISOString(),
  });
});

router.get("/subjects/:subjectId", requireApproved, async (req, res): Promise<void> => {
  const params = GetSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, params.data.subjectId));
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const chapters = await db.select().from(chaptersTable)
    .where(eq(chaptersTable.subjectId, subject.id))
    .orderBy(chaptersTable.order);

  const chaptersWithProgress = await Promise.all(chapters.map(async (ch) => {
    const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, ch.id));
    let completedTopics = 0;
    for (const t of topics) {
      const [prog] = await db.select().from(topicProgressTable)
        .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, req.user!.id)));
      if (prog?.topicTestPassed) completedTopics++;
    }
    const progressPercent = topics.length > 0 ? Math.round((completedTopics / topics.length) * 100) : 0;
    const allComplete = topics.length > 0 && completedTopics === topics.length;

    const [chapterExam] = await db.select().from(examsTable)
      .where(and(eq(examsTable.chapterId, ch.id), eq(examsTable.type, "chapter_test")));
    let chapterTestAttempted = false;
    if (chapterExam) {
      const [result] = await db.select().from(examResultsTable)
        .where(and(eq(examResultsTable.examId, chapterExam.id), eq(examResultsTable.userId, req.user!.id)));
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
  }));

  const { totalChapters, completedChapters } = await getSubjectWithProgress(subject.id, req.user!.id);
  const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
  const subjectTestUnlocked = await isSubjectTestUnlocked(subject.id, req.user!.id);
  const subjectTestExamId = await getSubjectTestExamId(subject.id);

  res.json({
    id: subject.id,
    name: subject.name,
    description: subject.description ?? null,
    order: subject.order,
    iconName: subject.iconName ?? null,
    gateStatus: completedChapters === totalChapters && totalChapters > 0 ? "completed" : "unlocked",
    progressPercent,
    subjectTestUnlocked,
    subjectTestExamId,
    chapters: chaptersWithProgress,
  });
});

router.patch("/subjects/:subjectId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSubjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [subject] = await db.update(subjectsTable)
    .set(parsed.data)
    .where(eq(subjectsTable.id, params.data.subjectId))
    .returning();

  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  res.json({
    id: subject.id, name: subject.name, description: subject.description ?? null,
    order: subject.order, iconName: subject.iconName ?? null,
    totalChapters: 0, completedChapters: 0, progressPercent: 0,
    gateStatus: "unlocked", subjectTestUnlocked: false, subjectTestExamId: null,
    createdAt: subject.createdAt.toISOString(),
  });
});

router.delete("/subjects/:subjectId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(subjectsTable).where(eq(subjectsTable.id, params.data.subjectId));
  res.sendStatus(204);
});

export default router;
