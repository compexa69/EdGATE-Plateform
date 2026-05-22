import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import { requireApproved } from "../lib/auth";
import { CreateExternalTestBody, DeleteExternalTestParams } from "@workspace/api-zod";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

function formatTest(t: Record<string, any>) {
  return {
    id: t.id,
    userId: t.user_id,
    examName: t.exam_name,
    examType: t.exam_type,
    score: t.score,
    maxScore: t.max_score,
    totalQuestions: t.total_questions ?? null,
    correctAnswers: t.correct_answers ?? null,
    incorrectAnswers: t.incorrect_answers ?? null,
    skippedAnswers: t.skipped_answers ?? null,
    rank: t.rank ?? null,
    percentile: t.percentile ?? null,
    attemptedAt: t.attempted_at,
    notes: t.notes ?? null,
    createdAt: t.created_at,
  };
}

router.get("/external-tests", requireApproved, async (req, res): Promise<void> => {
  const { data: tests } = await supabase.from("external_tests")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("attempted_at", { ascending: false });
  res.json((tests ?? []).map(formatTest));
});

router.post("/external-tests", requireApproved, async (req, res): Promise<void> => {
  const parsed = CreateExternalTestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data: test } = await supabase.from("external_tests").insert({
    id: nanoid(),
    user_id: req.user!.id,
    exam_name: parsed.data.examName,
    exam_type: parsed.data.examType ?? "other",
    score: parsed.data.score,
    max_score: parsed.data.maxScore,
    total_questions: parsed.data.totalQuestions ?? null,
    correct_answers: parsed.data.correctAnswers ?? null,
    incorrect_answers: parsed.data.incorrectAnswers ?? null,
    skipped_answers: parsed.data.skippedAnswers ?? null,
    rank: parsed.data.rank ?? null,
    percentile: parsed.data.percentile ?? null,
    attempted_at: parsed.data.attemptedAt,
    notes: parsed.data.notes ?? null,
  }).select().single();

  res.status(201).json(formatTest(test));
});

router.delete("/external-tests/:testId", requireApproved, async (req, res): Promise<void> => {
  const params = DeleteExternalTestParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const testId = params.data.testId;

  const { data: deleted } = await supabase.from("external_tests")
    .delete()
    .eq("id", testId)
    .eq("user_id", req.user!.id)
    .select()
    .maybeSingle();

  if (!deleted) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
