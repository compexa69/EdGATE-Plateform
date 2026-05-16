import { Router, type IRouter } from "express";
import { db, questionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ListQuestionsQueryParams,
  CreateQuestionBody,
  UpdateQuestionParams,
  UpdateQuestionBody,
  DeleteQuestionParams,
} from "@workspace/api-zod";
import { requireApproved, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

router.get("/questions", requireApproved, async (req, res): Promise<void> => {
  const params = ListQuestionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let query = db.select().from(questionsTable).$dynamic();
  if (params.data.topicId) {
    query = query.where(eq(questionsTable.topicId, params.data.topicId));
  }

  const questions = await query;
  res.json(questions.map((q) => ({
    id: q.id, text: q.text, options: q.options,
    correctOption: parseInt(q.correctOption, 10),
    marks: q.marks, topicId: q.topicId ?? null,
    textSolution: q.textSolution ?? null,
    videoUrl: q.videoUrl ?? null, qrCodeSvg: q.qrCodeSvg ?? null,
    difficulty: q.difficulty,
  })));
});

router.post("/questions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [q] = await db.insert(questionsTable).values({
    id: nanoid(),
    ...parsed.data,
    correctOption: String(parsed.data.correctOption),
  }).returning();

  res.status(201).json({
    id: q.id, text: q.text, options: q.options,
    correctOption: parseInt(q.correctOption, 10),
    marks: q.marks, topicId: q.topicId ?? null,
    textSolution: q.textSolution ?? null,
    videoUrl: q.videoUrl ?? null, qrCodeSvg: q.qrCodeSvg ?? null,
    difficulty: q.difficulty,
  });
});

router.patch("/questions/:questionId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.correctOption != null) updates.correctOption = String(parsed.data.correctOption);

  const [q] = await db.update(questionsTable)
    .set(updates)
    .where(eq(questionsTable.id, params.data.questionId))
    .returning();

  if (!q) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  res.json({
    id: q.id, text: q.text, options: q.options,
    correctOption: parseInt(q.correctOption, 10),
    marks: q.marks, topicId: q.topicId ?? null,
    textSolution: q.textSolution ?? null,
    videoUrl: q.videoUrl ?? null, qrCodeSvg: q.qrCodeSvg ?? null,
    difficulty: q.difficulty,
  });
});

router.delete("/questions/:questionId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(questionsTable).where(eq(questionsTable.id, params.data.questionId));
  res.sendStatus(204);
});

export default router;
