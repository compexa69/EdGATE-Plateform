import { Router, type IRouter } from "express";
import {
  db, qrScanLogsTable, questionsTable, examsTable, topicsTable,
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireApproved } from "../lib/auth";

const router: IRouter = Router();

router.post("/qr-scans", requireApproved, async (req, res): Promise<void> => {
  const { questionId, examId, resultId } = req.body as {
    questionId: string;
    examId?: string | null;
    resultId?: string | null;
  };

  if (!questionId) {
    res.status(400).json({ error: "questionId is required" });
    return;
  }

  const [question] = await db.select({ id: questionsTable.id })
    .from(questionsTable).where(eq(questionsTable.id, questionId));
  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const [log] = await db.insert(qrScanLogsTable).values({
    id: nanoid(),
    userId: req.user!.id,
    questionId,
    examId: examId ?? null,
    resultId: resultId ?? null,
  }).returning();

  res.status(201).json({ id: log.id, scannedAt: log.scannedAt.toISOString() });
});

router.get("/qr-scans", requireApproved, async (req, res): Promise<void> => {
  const logs = await db.select().from(qrScanLogsTable)
    .where(eq(qrScanLogsTable.userId, req.user!.id))
    .orderBy(desc(qrScanLogsTable.scannedAt))
    .limit(200);

  if (logs.length === 0) {
    res.json([]);
    return;
  }

  const questionIds = [...new Set(logs.map((l) => l.questionId))];
  const questions = await db.select({
    id: questionsTable.id,
    text: questionsTable.text,
    topicId: questionsTable.topicId,
    videoUrl: questionsTable.videoUrl,
  }).from(questionsTable).where(inArray(questionsTable.id, questionIds));
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  const examIds = [...new Set(logs.filter((l) => l.examId).map((l) => l.examId!))];
  const exams = examIds.length > 0
    ? await db.select({ id: examsTable.id, title: examsTable.title })
        .from(examsTable).where(inArray(examsTable.id, examIds))
    : [];
  const examMap = new Map(exams.map((e) => [e.id, e]));

  const topicIds = [...new Set(questions.filter((q) => q.topicId).map((q) => q.topicId!))];
  const topics = topicIds.length > 0
    ? await db.select({ id: topicsTable.id, name: topicsTable.name })
        .from(topicsTable).where(inArray(topicsTable.id, topicIds))
    : [];
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  res.json(logs.map((log) => {
    const q = questionMap.get(log.questionId);
    const exam = log.examId ? examMap.get(log.examId) : null;
    const topic = q?.topicId ? topicMap.get(q.topicId) : null;
    return {
      id: log.id,
      questionId: log.questionId,
      questionText: q?.text ?? "Unknown question",
      videoUrl: q?.videoUrl ?? null,
      examId: log.examId ?? null,
      examTitle: exam?.title ?? null,
      resultId: log.resultId ?? null,
      topicId: q?.topicId ?? null,
      topicName: topic?.name ?? null,
      scannedAt: log.scannedAt.toISOString(),
    };
  }));
});

export default router;
