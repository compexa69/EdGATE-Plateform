import { Router, type IRouter } from "express";
import { db, examsTable, examAttemptsTable, examQuestionsTable, questionsTable, attemptAnswersTable, examResultsTable, topicProgressTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ListExamsQueryParams,
  CreateExamBody,
  GetExamParams,
  StartExamParams,
  SaveAnswerParams,
  SaveAnswerBody,
  SubmitExamParams,
  SubmitExamBody,
  PauseExamParams,
  ResumeExamParams,
  GetResultParams,
} from "@workspace/api-zod";
import { requireApproved, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

function formatQuestion(q: typeof questionsTable.$inferSelect, showAnswer = false) {
  return {
    id: q.id,
    text: q.text,
    options: q.options,
    correctOption: showAnswer ? parseInt(q.correctOption, 10) : null,
    marks: q.marks,
    topicId: q.topicId ?? null,
    textSolution: showAnswer ? (q.textSolution ?? null) : null,
    videoUrl: showAnswer ? (q.videoUrl ?? null) : null,
    qrCodeSvg: showAnswer ? (q.qrCodeSvg ?? null) : null,
    difficulty: q.difficulty,
  };
}

router.get("/exams", requireApproved, async (req, res): Promise<void> => {
  const params = ListExamsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let query = db.select().from(examsTable).$dynamic();
  const conditions = [];
  if (params.data.type) conditions.push(eq(examsTable.type, params.data.type as typeof examsTable.$inferSelect["type"]));
  if (params.data.subjectId) conditions.push(eq(examsTable.subjectId, params.data.subjectId));
  if (params.data.chapterId) conditions.push(eq(examsTable.chapterId, params.data.chapterId));
  if (params.data.topicId) conditions.push(eq(examsTable.topicId, params.data.topicId));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const exams = await query;
  const result = await Promise.all(exams.map(async (e) => {
    const qCount = await db.select().from(examQuestionsTable).where(eq(examQuestionsTable.examId, e.id));
    const totalMarks = qCount.length * 4;
    const [attempt] = await db.select().from(examResultsTable)
      .where(and(eq(examResultsTable.examId, e.id), eq(examResultsTable.userId, req.user!.id)));
    return {
      id: e.id, title: e.title, type: e.type,
      subjectId: e.subjectId ?? null, chapterId: e.chapterId ?? null, topicId: e.topicId ?? null,
      durationMinutes: e.durationMinutes, totalQuestions: qCount.length, totalMarks,
      passingScore: e.passingScore ?? null, negativeMarking: e.negativeMarking,
      isUnlocked: true, hasAttempted: !!attempt,
      lastScore: attempt?.score ?? null, createdAt: e.createdAt.toISOString(),
    };
  }));
  res.json(result);
});

router.post("/exams", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateExamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { questionIds, ...examData } = parsed.data;
  const [exam] = await db.insert(examsTable).values({
    id: nanoid(),
    ...examData,
  }).returning();

  if (questionIds?.length) {
    await db.insert(examQuestionsTable).values(
      questionIds.map((qId, i) => ({ id: nanoid(), examId: exam.id, questionId: qId, order: i }))
    );
  }

  res.status(201).json({
    id: exam.id, title: exam.title, type: exam.type,
    subjectId: exam.subjectId ?? null, chapterId: exam.chapterId ?? null, topicId: exam.topicId ?? null,
    durationMinutes: exam.durationMinutes, totalQuestions: questionIds?.length ?? 0,
    totalMarks: (questionIds?.length ?? 0) * 4,
    passingScore: exam.passingScore ?? null, negativeMarking: exam.negativeMarking,
    isUnlocked: true, hasAttempted: false, lastScore: null, createdAt: exam.createdAt.toISOString(),
  });
});

router.get("/exams/:examId", requireApproved, async (req, res): Promise<void> => {
  const params = GetExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, params.data.examId));
  if (!exam) {
    res.status(404).json({ error: "Exam not found" });
    return;
  }

  const examQs = await db.select().from(examQuestionsTable)
    .where(eq(examQuestionsTable.examId, exam.id))
    .orderBy(examQuestionsTable.order);

  const questions = examQs.length > 0
    ? await db.select().from(questionsTable)
      .where(inArray(questionsTable.id, examQs.map((q) => q.questionId)))
    : [];

  res.json({
    id: exam.id, title: exam.title, type: exam.type,
    durationMinutes: exam.durationMinutes,
    totalQuestions: questions.length,
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    passingScore: exam.passingScore ?? null,
    negativeMarking: exam.negativeMarking,
    isUnlocked: true,
    questions: questions.map((q) => formatQuestion(q, false)),
  });
});

router.post("/exams/:examId/start", requireApproved, async (req, res): Promise<void> => {
  const params = StartExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, params.data.examId));
  if (!exam) {
    res.status(404).json({ error: "Exam not found" });
    return;
  }

  const [attempt] = await db.insert(examAttemptsTable).values({
    id: nanoid(),
    userId: req.user!.id,
    examId: exam.id,
    status: "in_progress",
    startTime: new Date(),
    remainingSeconds: exam.durationMinutes * 60,
    pauseCount: 0,
  }).returning();

  const examQs = await db.select().from(examQuestionsTable)
    .where(eq(examQuestionsTable.examId, exam.id))
    .orderBy(examQuestionsTable.order);

  const questions = examQs.length > 0
    ? await db.select().from(questionsTable)
      .where(inArray(questionsTable.id, examQs.map((q) => q.questionId)))
    : [];

  res.json({
    id: attempt.id, examId: attempt.examId, userId: attempt.userId,
    status: attempt.status, startTime: attempt.startTime.toISOString(),
    pauseCount: attempt.pauseCount, remainingSeconds: attempt.remainingSeconds,
    answers: [], questions: questions.map((q) => formatQuestion(q, false)),
  });
});

router.post("/attempts/:attemptId/answer", requireApproved, async (req, res): Promise<void> => {
  const params = SaveAnswerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SaveAnswerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(attemptAnswersTable)
    .where(and(
      eq(attemptAnswersTable.attemptId, params.data.attemptId),
      eq(attemptAnswersTable.questionId, parsed.data.questionId)
    ));

  if (existing) {
    await db.update(attemptAnswersTable).set({
      selectedOption: parsed.data.selectedOption != null ? String(parsed.data.selectedOption) : null,
      isMarkedForReview: parsed.data.isMarkedForReview,
      timeSpentSeconds: parsed.data.timeSpentSeconds,
    }).where(eq(attemptAnswersTable.id, existing.id));
  } else {
    await db.insert(attemptAnswersTable).values({
      id: nanoid(),
      attemptId: params.data.attemptId,
      questionId: parsed.data.questionId,
      selectedOption: parsed.data.selectedOption != null ? String(parsed.data.selectedOption) : null,
      isMarkedForReview: parsed.data.isMarkedForReview,
      timeSpentSeconds: parsed.data.timeSpentSeconds,
    });
  }

  res.json({ success: true, message: "Answer saved" });
});

router.post("/attempts/:attemptId/submit", requireApproved, async (req, res): Promise<void> => {
  const params = SubmitExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SubmitExamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [attempt] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, params.data.attemptId));
  if (!attempt) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, attempt.examId));
  const examQs = await db.select().from(examQuestionsTable).where(eq(examQuestionsTable.examId, exam.id));
  const questions = examQs.length > 0
    ? await db.select().from(questionsTable).where(inArray(questionsTable.id, examQs.map((q) => q.questionId)))
    : [];

  const answerMap = new Map(parsed.data.answers.map((a) => [a.questionId, a]));

  let score = 0;
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  const totalTime = parsed.data.answers.reduce((s, a) => s + a.timeSpentSeconds, 0);

  const questionWise = questions.map((q) => {
    const answer = answerMap.get(q.id);
    const selected = answer?.selectedOption;
    const correctOpt = parseInt(q.correctOption, 10);
    let isCorrect = false;
    let marksAwarded = 0;

    if (selected == null || selected === undefined) {
      skipped++;
    } else if (selected === correctOpt) {
      isCorrect = true;
      correct++;
      marksAwarded = q.marks;
      score += q.marks;
    } else {
      incorrect++;
      marksAwarded = -exam.negativeMarking;
      score -= exam.negativeMarking;
    }

    return {
      questionId: q.id,
      questionText: q.text,
      selectedOption: selected ?? null,
      correctOption: correctOpt,
      isCorrect,
      marksAwarded,
      timeSpentSeconds: answer?.timeSpentSeconds ?? 0,
      textSolution: q.textSolution ?? null,
      videoUrl: q.videoUrl ?? null,
      qrCodeSvg: q.qrCodeSvg ?? null,
    };
  });

  const maxScore = questions.reduce((s, q) => s + q.marks, 0);
  const accuracy = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
  const passed = exam.passingScore ? score >= exam.passingScore : score > 0;

  const [result] = await db.insert(examResultsTable).values({
    id: nanoid(),
    attemptId: attempt.id,
    userId: req.user!.id,
    examId: exam.id,
    score: Math.max(0, score),
    maxScore,
    accuracy,
    totalQuestions: questions.length,
    correctAnswers: correct,
    incorrectAnswers: incorrect,
    skippedAnswers: skipped,
    timeTakenSeconds: totalTime,
    passed,
    submittedAt: new Date(),
  }).returning();

  await db.update(examAttemptsTable)
    .set({ status: "submitted", endTime: new Date() })
    .where(eq(examAttemptsTable.id, attempt.id));

  if (exam.type === "lecture_quiz" && exam.topicId) {
    await updateTopicProgress(req.user!.id, exam.topicId, "lectureQuizPassed", passed);
  } else if (exam.type === "dpp" && exam.topicId) {
    await updateTopicProgress(req.user!.id, exam.topicId, "dppCompleted", true);
  } else if (exam.type === "pyq" && exam.topicId) {
    await updateTopicProgress(req.user!.id, exam.topicId, "pyqCompleted", true);
  } else if (exam.type === "topic_test" && exam.topicId) {
    await updateTopicProgress(req.user!.id, exam.topicId, "topicTestPassed", passed);
  }

  res.json({
    id: result.id, examId: exam.id, examTitle: exam.title, examType: exam.type,
    score: result.score, maxScore: result.maxScore, accuracy: result.accuracy,
    totalQuestions: result.totalQuestions, correctAnswers: result.correctAnswers,
    incorrectAnswers: result.incorrectAnswers, skippedAnswers: result.skippedAnswers,
    timeTakenSeconds: result.timeTakenSeconds, percentile: null,
    passed: result.passed,
    questionWise,
    topicWise: [],
    submittedAt: result.submittedAt.toISOString(),
  });
});

async function updateTopicProgress(userId: string, topicId: string, field: string, value: boolean) {
  const [existing] = await db.select().from(topicProgressTable)
    .where(and(eq(topicProgressTable.userId, userId), eq(topicProgressTable.topicId, topicId)));

  if (existing) {
    await db.update(topicProgressTable)
      .set({ [field]: value })
      .where(eq(topicProgressTable.id, existing.id));
  } else {
    await db.insert(topicProgressTable).values({
      id: nanoid(),
      userId,
      topicId,
      [field]: value,
    });
  }
}

router.post("/attempts/:attemptId/pause", requireApproved, async (req, res): Promise<void> => {
  const params = PauseExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [attempt] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, params.data.attemptId));
  if (!attempt) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }

  await db.update(examAttemptsTable)
    .set({ status: "paused", pauseCount: attempt.pauseCount + 1 })
    .where(eq(examAttemptsTable.id, attempt.id));

  res.json({ success: true, message: "Exam paused" });
});

router.post("/attempts/:attemptId/resume", requireApproved, async (req, res): Promise<void> => {
  const params = ResumeExamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [attempt] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, params.data.attemptId));
  if (!attempt) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }

  await db.update(examAttemptsTable)
    .set({ status: "in_progress" })
    .where(eq(examAttemptsTable.id, attempt.id));

  const examQs = await db.select().from(examQuestionsTable)
    .where(eq(examQuestionsTable.examId, attempt.examId))
    .orderBy(examQuestionsTable.order);

  const questions = examQs.length > 0
    ? await db.select().from(questionsTable).where(inArray(questionsTable.id, examQs.map((q) => q.questionId)))
    : [];

  const answers = await db.select().from(attemptAnswersTable)
    .where(eq(attemptAnswersTable.attemptId, attempt.id));

  res.json({
    id: attempt.id, examId: attempt.examId, userId: attempt.userId,
    status: "in_progress", startTime: attempt.startTime.toISOString(),
    pauseCount: attempt.pauseCount, remainingSeconds: attempt.remainingSeconds,
    answers: answers.map((a) => ({
      questionId: a.questionId,
      selectedOption: a.selectedOption != null ? parseInt(a.selectedOption, 10) : null,
      isMarkedForReview: a.isMarkedForReview,
      timeSpentSeconds: a.timeSpentSeconds,
    })),
    questions: questions.map((q) => formatQuestion(q, false)),
  });
});

router.get("/results/:resultId", requireApproved, async (req, res): Promise<void> => {
  const params = GetResultParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [result] = await db.select().from(examResultsTable).where(eq(examResultsTable.id, params.data.resultId));
  if (!result) {
    res.status(404).json({ error: "Result not found" });
    return;
  }

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, result.examId));
  const examQs = await db.select().from(examQuestionsTable).where(eq(examQuestionsTable.examId, exam.id));
  const questions = examQs.length > 0
    ? await db.select().from(questionsTable).where(inArray(questionsTable.id, examQs.map((q) => q.questionId)))
    : [];

  const answers = await db.select().from(attemptAnswersTable)
    .where(eq(attemptAnswersTable.attemptId, result.attemptId));
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));

  const questionWise = questions.map((q) => {
    const answer = answerMap.get(q.id);
    const correctOpt = parseInt(q.correctOption, 10);
    const selected = answer?.selectedOption != null ? parseInt(answer.selectedOption, 10) : null;
    const isCorrect = selected === correctOpt;
    const marksAwarded = selected == null ? 0 : isCorrect ? q.marks : -exam.negativeMarking;
    return {
      questionId: q.id, questionText: q.text,
      selectedOption: selected, correctOption: correctOpt,
      isCorrect, marksAwarded,
      timeSpentSeconds: answer?.timeSpentSeconds ?? 0,
      textSolution: q.textSolution ?? null, videoUrl: q.videoUrl ?? null, qrCodeSvg: q.qrCodeSvg ?? null,
    };
  });

  res.json({
    id: result.id, examId: result.examId, examTitle: exam.title, examType: exam.type,
    score: result.score, maxScore: result.maxScore, accuracy: result.accuracy,
    totalQuestions: result.totalQuestions, correctAnswers: result.correctAnswers,
    incorrectAnswers: result.incorrectAnswers, skippedAnswers: result.skippedAnswers,
    timeTakenSeconds: result.timeTakenSeconds, percentile: null,
    passed: result.passed, questionWise, topicWise: [],
    submittedAt: result.submittedAt.toISOString(),
  });
});

router.get("/results", requireApproved, async (req, res): Promise<void> => {
  const results = await db.select().from(examResultsTable)
    .where(eq(examResultsTable.userId, req.user!.id));

  const formatted = await Promise.all(results.map(async (r) => {
    const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, r.examId));
    return {
      id: r.id, examId: r.examId, examTitle: exam?.title ?? "Unknown",
      examType: exam?.type ?? "grand_test",
      score: r.score, maxScore: r.maxScore, accuracy: r.accuracy,
      passed: r.passed, submittedAt: r.submittedAt.toISOString(),
    };
  }));

  res.json(formatted);
});

router.post("/gate/check", requireApproved, async (req, res): Promise<void> => {
  const { targetId, targetType } = req.body as { targetId: string; targetType: string };

  res.json({
    allowed: true,
    nextStep: null,
    reason: null,
    gateStatus: "unlocked",
  });
});

export default router;
