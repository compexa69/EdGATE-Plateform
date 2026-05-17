import { Router, type IRouter } from "express";
import { db, externalTestsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireApproved } from "../lib/auth";
import { CreateExternalTestBody, DeleteExternalTestParams } from "@workspace/api-zod";

const router: IRouter = Router();

function formatTest(t: typeof externalTestsTable.$inferSelect) {
  return {
    id: t.id,
    userId: t.userId,
    examName: t.examName,
    examType: t.examType,
    score: t.score,
    maxScore: t.maxScore,
    totalQuestions: t.totalQuestions ?? null,
    correctAnswers: t.correctAnswers ?? null,
    incorrectAnswers: t.incorrectAnswers ?? null,
    skippedAnswers: t.skippedAnswers ?? null,
    rank: t.rank ?? null,
    percentile: t.percentile ?? null,
    attemptedAt: t.attemptedAt.toISOString(),
    notes: t.notes ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/external-tests", requireApproved, async (req, res): Promise<void> => {
  const tests = await db
    .select()
    .from(externalTestsTable)
    .where(eq(externalTestsTable.userId, req.user!.id))
    .orderBy(desc(externalTestsTable.attemptedAt));
  res.json(tests.map(formatTest));
});

router.post("/external-tests", requireApproved, async (req, res): Promise<void> => {
  const parsed = CreateExternalTestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [test] = await db
    .insert(externalTestsTable)
    .values({
      id: nanoid(),
      userId: req.user!.id,
      examName: parsed.data.examName,
      examType: parsed.data.examType ?? "other",
      score: parsed.data.score,
      maxScore: parsed.data.maxScore,
      totalQuestions: parsed.data.totalQuestions ?? null,
      correctAnswers: parsed.data.correctAnswers ?? null,
      incorrectAnswers: parsed.data.incorrectAnswers ?? null,
      skippedAnswers: parsed.data.skippedAnswers ?? null,
      rank: parsed.data.rank ?? null,
      percentile: parsed.data.percentile ?? null,
      attemptedAt: parsed.data.attemptedAt,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  res.status(201).json(formatTest(test));
});

router.delete("/external-tests/:testId", requireApproved, async (req, res): Promise<void> => {
  const params = DeleteExternalTestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const testId = params.data.testId;

  const [deleted] = await db
    .delete(externalTestsTable)
    .where(and(eq(externalTestsTable.id, testId), eq(externalTestsTable.userId, req.user!.id)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
