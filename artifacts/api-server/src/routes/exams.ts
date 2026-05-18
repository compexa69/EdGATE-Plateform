import { Router, type IRouter } from "express";
import {
  db, examsTable, examAttemptsTable, examQuestionsTable, questionsTable,
  attemptAnswersTable, examResultsTable, topicProgressTable,
  chaptersTable, topicsTable, subjectsTable,
} from "@workspace/db";
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
import { createNotification } from "./notifications";

const router: IRouter = Router();

// ── Gate helpers ─────────────────────────────────────────────────────────────

/** Returns true if every topic in the chapter has topicTestPassed. */
async function isChapterTestUnlocked(chapterId: string, userId: string): Promise<boolean> {
  const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, chapterId));
  if (topics.length === 0) return false;
  for (const t of topics) {
    const [prog] = await db.select().from(topicProgressTable)
      .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, userId)));
    if (!prog?.topicTestPassed) return false;
  }
  return true;
}

/** Returns true if the user has at least one submitted result for any chapter_test in this chapter. */
async function isNotesUploadUnlocked(chapterId: string, userId: string): Promise<boolean> {
  const chapterExams = await db.select().from(examsTable)
    .where(and(eq(examsTable.chapterId, chapterId), eq(examsTable.type, "chapter_test")));
  if (chapterExams.length === 0) return false;
  for (const exam of chapterExams) {
    const [result] = await db.select().from(examResultsTable)
      .where(and(eq(examResultsTable.examId, exam.id), eq(examResultsTable.userId, userId)));
    if (result) return true;
  }
  return false;
}

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
    if (!chapterExam) return false;
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

/**
 * Grand Test is unlocked when every subject has at least one passed subject_test result.
 */
async function isGrandTestUnlocked(userId: string): Promise<boolean> {
  const subjects = await db.select().from(subjectsTable);
  if (subjects.length === 0) return false;
  for (const s of subjects) {
    const unlocked = await isSubjectTestUnlocked(s.id, userId);
    if (!unlocked) return false;
  }
  return true;
}

/** Compute isUnlocked for a given exam row for this user. */
async function computeExamUnlocked(
  exam: typeof examsTable.$inferSelect,
  userId: string,
): Promise<boolean> {
  if (exam.type === "chapter_test" && exam.chapterId) {
    return isChapterTestUnlocked(exam.chapterId, userId);
  }
  if (exam.type === "subject_test" && exam.subjectId) {
    return isSubjectTestUnlocked(exam.subjectId, userId);
  }
  if (exam.type === "grand_test") {
    return isGrandTestUnlocked(userId);
  }
  return true;
}

// ── Question formatter ────────────────────────────────────────────────────────

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

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/exams", requireApproved, async (req, res): Promise<void> => {
  const params = ListExamsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

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
    const isUnlocked = await computeExamUnlocked(e, req.user!.id);
    return {
      id: e.id, title: e.title, type: e.type,
      subjectId: e.subjectId ?? null, chapterId: e.chapterId ?? null, topicId: e.topicId ?? null,
      durationMinutes: e.durationMinutes, totalQuestions: qCount.length, totalMarks,
      passingScore: e.passingScore ?? null, negativeMarking: e.negativeMarking,
      isUnlocked, hasAttempted: !!attempt,
      lastScore: attempt?.score ?? null, createdAt: e.createdAt.toISOString(),
    };
  }));
  res.json(result);
});

router.post("/exams", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateExamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { questionIds, ...examData } = parsed.data;
  const [exam] = await db.insert(examsTable).values({ id: nanoid(), ...examData }).returning();

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

router.delete("/exams/:examId", requireAdmin, async (req, res): Promise<void> => {
  const examId = String(req.params.examId);
  const [deleted] = await db.delete(examsTable).where(eq(examsTable.id, examId)).returning();
  if (!deleted) { res.status(404).json({ error: "Exam not found" }); return; }
  res.sendStatus(204);
});

router.get("/exams/:examId/questions", requireApproved, async (req, res): Promise<void> => {
  const examId = String(req.params.examId);
  const examQs = await db.select().from(examQuestionsTable)
    .where(eq(examQuestionsTable.examId, examId))
    .orderBy(examQuestionsTable.order);
  if (examQs.length === 0) { res.json([]); return; }
  const questionIds = examQs.map((aq) => aq.questionId);
  const questions = await db.select().from(questionsTable)
    .where(inArray(questionsTable.id, questionIds));
  const ordered = examQs.map((aq) => questions.find((q) => q.id === aq.questionId)).filter(Boolean);
  res.json(ordered.map((q) => formatQuestion(q!, false)));
});

router.post("/exams/:examId/questions", requireAdmin, async (req, res): Promise<void> => {
  const examId = String(req.params.examId);
  const { questionId, order } = req.body as { questionId?: string; order?: number };
  if (!questionId) { res.status(400).json({ error: "questionId required" }); return; }
  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, examId));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  const existingRows = await db.select().from(examQuestionsTable)
    .where(and(eq(examQuestionsTable.examId, examId), eq(examQuestionsTable.questionId, String(questionId))));
  if (existingRows.length > 0) { res.status(409).json({ error: "Question already in exam" }); return; }
  const allQs = await db.select().from(examQuestionsTable).where(eq(examQuestionsTable.examId, examId));
  await db.insert(examQuestionsTable).values({
    id: nanoid(),
    examId,
    questionId: String(questionId),
    order: order ?? allQs.length,
  });
  res.status(201).json({ success: true, message: "Question added to exam" });
});

router.delete("/exams/:examId/questions/:questionId", requireAdmin, async (req, res): Promise<void> => {
  const examId = String(req.params.examId);
  const questionId = String(req.params.questionId);
  await db.delete(examQuestionsTable)
    .where(and(eq(examQuestionsTable.examId, examId), eq(examQuestionsTable.questionId, questionId)));
  res.sendStatus(204);
});

router.get("/exams/:examId", requireApproved, async (req, res): Promise<void> => {
  const params = GetExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, params.data.examId));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const examQs = await db.select().from(examQuestionsTable)
    .where(eq(examQuestionsTable.examId, exam.id))
    .orderBy(examQuestionsTable.order);

  const questions = examQs.length > 0
    ? await db.select().from(questionsTable)
      .where(inArray(questionsTable.id, examQs.map((q) => q.questionId)))
    : [];

  const isUnlocked = await computeExamUnlocked(exam, req.user!.id);

  res.json({
    id: exam.id, title: exam.title, type: exam.type,
    durationMinutes: exam.durationMinutes,
    totalQuestions: questions.length,
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    passingScore: exam.passingScore ?? null,
    negativeMarking: exam.negativeMarking,
    isUnlocked,
    questions: questions.map((q) => formatQuestion(q, false)),
  });
});

router.post("/exams/:examId/start", requireApproved, async (req, res): Promise<void> => {
  const params = StartExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, params.data.examId));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  // ── Chapter Test gate enforcement ──────────────────────────────────────────
  if (exam.type === "chapter_test" && exam.chapterId) {
    const unlocked = await isChapterTestUnlocked(exam.chapterId, req.user!.id);
    if (!unlocked) {
      res.status(403).json({
        error: "Chapter Test is locked",
        reason: "Complete all topic tests in this chapter before attempting the Chapter Test.",
      });
      return;
    }
  }

  // ── Subject Test gate enforcement ───────────────────────────────────────────
  if (exam.type === "subject_test" && exam.subjectId) {
    const unlocked = await isSubjectTestUnlocked(exam.subjectId, req.user!.id);
    if (!unlocked) {
      res.status(403).json({
        error: "Subject Test is locked",
        reason: "Pass the Chapter Test for every chapter in this subject before attempting the Subject Test.",
      });
      return;
    }
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
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SaveAnswerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

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
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SubmitExamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [attempt] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, params.data.attemptId));
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }

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
      questionId: q.id, questionText: q.text,
      selectedOption: selected ?? null, correctOption: correctOpt,
      isCorrect, marksAwarded,
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

  // Prompt a targeted drill when a topic test is failed with wrong (not just skipped) answers
  if (exam.type === "topic_test" && !passed && incorrect > 0) {
    (async () => {
      try {
        await createNotification(
          req.user!.id,
          "exam_reminder",
          "Topic Test Failed — Drill Available",
          `You got ${incorrect} question${incorrect > 1 ? "s" : ""} wrong in "${exam.title}". Open your results to launch a focused drill on exactly those gaps before retrying.`,
        );
      } catch {}
    })();
  }

  // Topic-wise breakdown
  const twStats = new Map<string, { name: string; correct: number; total: number }>();
  for (const q of questions) {
    if (!q.topicId) continue;
    const stat = twStats.get(q.topicId) ?? { name: "", correct: 0, total: 0 };
    stat.total++;
    const ans = answerMap.get(q.id);
    if (ans?.selectedOption != null && ans.selectedOption === parseInt(q.correctOption, 10)) stat.correct++;
    twStats.set(q.topicId, stat);
  }
  const twIds = Array.from(twStats.keys());
  if (twIds.length > 0) {
    const topicRows = await db.select({ id: topicsTable.id, name: topicsTable.name })
      .from(topicsTable).where(inArray(topicsTable.id, twIds));
    for (const t of topicRows) { const s = twStats.get(t.id); if (s) s.name = t.name; }
  }
  const topicWise = Array.from(twStats.entries()).map(([topicId, s]) => ({
    topicId, topicName: s.name || "Unknown",
    correctAnswers: s.correct, totalQuestions: s.total,
    accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
  }));

  res.json({
    id: result.id, examId: exam.id, examTitle: exam.title, examType: exam.type,
    score: result.score, maxScore: result.maxScore, accuracy: result.accuracy,
    totalQuestions: result.totalQuestions, correctAnswers: result.correctAnswers,
    incorrectAnswers: result.incorrectAnswers, skippedAnswers: result.skippedAnswers,
    timeTakenSeconds: result.timeTakenSeconds, percentile: null,
    passed: result.passed,
    questionWise,
    topicWise,
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
      id: nanoid(), userId, topicId, [field]: value,
    });
  }
}

router.post("/attempts/:attemptId/pause", requireApproved, async (req, res): Promise<void> => {
  const params = PauseExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [attempt] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, params.data.attemptId));
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }

  await db.update(examAttemptsTable)
    .set({ status: "paused", pauseCount: attempt.pauseCount + 1 })
    .where(eq(examAttemptsTable.id, attempt.id));

  res.json({ success: true, message: "Exam paused" });
});

router.post("/attempts/:attemptId/resume", requireApproved, async (req, res): Promise<void> => {
  const params = ResumeExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [attempt] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, params.data.attemptId));
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }

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
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [result] = await db.select().from(examResultsTable).where(eq(examResultsTable.id, params.data.resultId));
  if (!result) { res.status(404).json({ error: "Result not found" }); return; }

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

  // Topic-wise breakdown (GET results)
  const twStatsGet = new Map<string, { name: string; correct: number; total: number }>();
  for (const q of questions) {
    if (!q.topicId) continue;
    const stat = twStatsGet.get(q.topicId) ?? { name: "", correct: 0, total: 0 };
    stat.total++;
    const ans = answerMap.get(q.id);
    const sel = ans?.selectedOption != null ? parseInt(ans.selectedOption, 10) : null;
    if (sel != null && sel === parseInt(q.correctOption, 10)) stat.correct++;
    twStatsGet.set(q.topicId, stat);
  }
  const twIdsGet = Array.from(twStatsGet.keys());
  if (twIdsGet.length > 0) {
    const topicRowsGet = await db.select({ id: topicsTable.id, name: topicsTable.name })
      .from(topicsTable).where(inArray(topicsTable.id, twIdsGet));
    for (const t of topicRowsGet) { const s = twStatsGet.get(t.id); if (s) s.name = t.name; }
  }
  const topicWise = Array.from(twStatsGet.entries()).map(([topicId, s]) => ({
    topicId, topicName: s.name || "Unknown",
    correctAnswers: s.correct, totalQuestions: s.total,
    accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
  }));

  res.json({
    id: result.id, examId: result.examId, examTitle: exam.title, examType: exam.type,
    score: result.score, maxScore: result.maxScore, accuracy: result.accuracy,
    totalQuestions: result.totalQuestions, correctAnswers: result.correctAnswers,
    incorrectAnswers: result.incorrectAnswers, skippedAnswers: result.skippedAnswers,
    timeTakenSeconds: result.timeTakenSeconds, percentile: null,
    passed: result.passed, questionWise, topicWise,
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

// ── Weak-Topic Drill ──────────────────────────────────────────────────────────
// Creates a fresh 5-question drill exam from the wrong answers in a failed result.

router.post("/results/:resultId/drill", requireApproved, async (req, res): Promise<void> => {
  const resultId = String(req.params.resultId);

  const [result] = await db.select().from(examResultsTable)
    .where(and(eq(examResultsTable.id, resultId), eq(examResultsTable.userId, req.user!.id)));
  if (!result) { res.status(404).json({ error: "Result not found" }); return; }
  if (result.passed) { res.status(400).json({ error: "Cannot drill a passed exam — well done!" }); return; }

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, result.examId));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  if (exam.type === "drill") { res.status(400).json({ error: "Cannot create a drill from a drill" }); return; }

  // Fetch the original questions and the student's saved answers
  const examQs = await db.select().from(examQuestionsTable)
    .where(eq(examQuestionsTable.examId, exam.id));
  const questionIds = examQs.map((q) => q.questionId);
  if (questionIds.length === 0) { res.status(400).json({ error: "No questions found" }); return; }

  const questions = await db.select().from(questionsTable)
    .where(inArray(questionsTable.id, questionIds));

  const answers = await db.select().from(attemptAnswersTable)
    .where(eq(attemptAnswersTable.attemptId, result.attemptId));
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));

  // Wrong = answered (not skipped) but chose the wrong option
  const wrongQuestions = questions.filter((q) => {
    const ans = answerMap.get(q.id);
    if (!ans || ans.selectedOption == null) return false;
    return parseInt(ans.selectedOption, 10) !== parseInt(q.correctOption, 10);
  });

  if (wrongQuestions.length === 0) {
    res.status(400).json({ error: "No wrong answers to drill — you only skipped questions. Retry the full exam instead." });
    return;
  }

  // Shuffle and cap at 5
  const drillQs = wrongQuestions.sort(() => Math.random() - 0.5).slice(0, 5);

  // Build the ephemeral drill exam (no passingScore, no negative marking)
  const drillExamId = nanoid();
  await db.insert(examsTable).values({
    id: drillExamId,
    title: `Drill: ${exam.title}`,
    type: "drill",
    topicId: exam.topicId,
    subjectId: exam.subjectId,
    chapterId: exam.chapterId,
    durationMinutes: 10,
    passingScore: null,
    negativeMarking: 0,
  });

  await db.insert(examQuestionsTable).values(
    drillQs.map((q, i) => ({ id: nanoid(), examId: drillExamId, questionId: q.id, order: i })),
  );

  res.json({ drillExamId, questionCount: drillQs.length });
});

// ── Gate check ────────────────────────────────────────────────────────────────
// Checks whether the user is allowed to start a given exam based on SRS gating.

router.post("/gate/check", requireApproved, async (req, res): Promise<void> => {
  const { targetId, targetType } = req.body as { targetId: string; targetType: string };

  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, targetId));
  if (!exam) {
    res.status(404).json({ error: "Exam not found" });
    return;
  }

  const userId = req.user!.id;

  // Subject-level gate
  if (targetType === "subject_test" || exam.type === "subject_test") {
    if (!exam.subjectId) {
      res.json({ allowed: true, nextStep: null, reason: null, gateStatus: "unlocked" });
      return;
    }
    const unlocked = await isSubjectTestUnlocked(exam.subjectId, userId);
    if (!unlocked) {
      res.json({
        allowed: false,
        nextStep: "chapter_test",
        reason: "Pass all Chapter Tests in this subject first.",
        gateStatus: "locked",
      });
      return;
    }
    res.json({ allowed: true, nextStep: null, reason: null, gateStatus: "unlocked" });
    return;
  }

  // Chapter-level gate
  if (targetType === "chapter_test" || exam.type === "chapter_test") {
    if (!exam.chapterId) {
      res.json({ allowed: true, nextStep: null, reason: null, gateStatus: "unlocked" });
      return;
    }
    const unlocked = await isChapterTestUnlocked(exam.chapterId, userId);
    if (!unlocked) {
      res.json({
        allowed: false,
        nextStep: "topic_test",
        reason: "Complete all topic tests in this chapter first.",
        gateStatus: "locked",
      });
      return;
    }
    res.json({ allowed: true, nextStep: null, reason: null, gateStatus: "unlocked" });
    return;
  }

  // Topic-level gates (lecture_quiz, dpp, pyq, topic_test)
  if (!exam.topicId) {
    res.json({ allowed: true, nextStep: null, reason: null, gateStatus: "unlocked" });
    return;
  }

  const [prog] = await db.select().from(topicProgressTable)
    .where(and(eq(topicProgressTable.topicId, exam.topicId), eq(topicProgressTable.userId, userId)));

  let allowed = true;
  let nextStep: string | null = null;
  let reason: string | null = null;

  if (targetType === "lecture_quiz" || exam.type === "lecture_quiz") {
    // Lecture quiz requires at least one lecture click
    if (!prog || prog.lectureClickCount === 0) {
      allowed = false;
      nextStep = "lecture";
      reason = "Watch the video lecture before attempting the quiz.";
    }
  } else if (targetType === "dpp" || exam.type === "dpp") {
    if (!prog?.lectureQuizPassed) {
      allowed = false;
      nextStep = "lecture_quiz";
      reason = "Pass the Lecture Quiz before attempting DPP.";
    }
  } else if (targetType === "pyq" || exam.type === "pyq") {
    if (!prog?.dppCompleted) {
      allowed = false;
      nextStep = "dpp";
      reason = "Complete the DPP before attempting PYQs.";
    }
  } else if (targetType === "topic_test" || exam.type === "topic_test") {
    if (!prog?.pyqCompleted) {
      allowed = false;
      nextStep = "pyq";
      reason = "Complete the PYQs before attempting the Topic Test.";
    }
  }

  res.json({
    allowed,
    nextStep,
    reason,
    gateStatus: allowed ? "unlocked" : "locked",
  });
});

export default router;
