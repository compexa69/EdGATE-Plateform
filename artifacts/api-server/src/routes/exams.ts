import { Router, type IRouter } from "express";
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
  PauseExamBody,
  ResumeExamParams,
  GetResultParams,
} from "@workspace/api-zod";
import { requireApproved, requireAdmin } from "../lib/auth";
import { createNotification } from "./notifications";
import { sendNewQuizEmail } from "../lib/email";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

// ── Gate helpers ──────────────────────────────────────────────────────────────

async function isChapterTestUnlocked(chapterId: string, userId: string): Promise<boolean> {
  const { data: topics } = await supabase.from("topics").select("id").eq("chapter_id", chapterId);
  if (!topics || topics.length === 0) return false;
  for (const t of topics) {
    const { data: prog } = await supabase.from("topic_progress")
      .select("topic_test_passed")
      .eq("topic_id", t.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!prog?.topic_test_passed) return false;
  }
  return true;
}

async function isNotesUploadUnlocked(chapterId: string, userId: string): Promise<boolean> {
  const { data: chapterExams } = await supabase.from("exams")
    .select("id")
    .eq("chapter_id", chapterId)
    .eq("type", "chapter_test");
  if (!chapterExams || chapterExams.length === 0) return false;
  for (const exam of chapterExams) {
    const { data: result } = await supabase.from("exam_results")
      .select("id")
      .eq("exam_id", exam.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (result) return true;
  }
  return false;
}

async function isSubjectTestUnlocked(subjectId: string, userId: string): Promise<boolean> {
  const { data: chapters } = await supabase.from("chapters").select("id").eq("subject_id", subjectId);
  if (!chapters || chapters.length === 0) return false;
  for (const ch of chapters) {
    const { data: chapterExam } = await supabase.from("exams")
      .select("id")
      .eq("chapter_id", ch.id)
      .eq("type", "chapter_test")
      .maybeSingle();
    if (!chapterExam) return false;
    const { data: passedResult } = await supabase.from("exam_results")
      .select("id")
      .eq("exam_id", chapterExam.id)
      .eq("user_id", userId)
      .eq("passed", true)
      .maybeSingle();
    if (!passedResult) return false;
  }
  return true;
}

async function isGrandTestUnlocked(userId: string): Promise<boolean> {
  const { data: subjects } = await supabase.from("subjects").select("id");
  if (!subjects || subjects.length === 0) return false;
  for (const s of subjects) {
    const unlocked = await isSubjectTestUnlocked(s.id, userId);
    if (!unlocked) return false;
  }
  return true;
}

async function computeExamUnlocked(exam: Record<string, any>, userId: string): Promise<boolean> {
  if (exam.type === "chapter_test" && exam.chapter_id) {
    return isChapterTestUnlocked(exam.chapter_id, userId);
  }
  if (exam.type === "subject_test" && exam.subject_id) {
    return isSubjectTestUnlocked(exam.subject_id, userId);
  }
  if (exam.type === "grand_test") {
    return isGrandTestUnlocked(userId);
  }
  return true;
}

// ── Question formatter ────────────────────────────────────────────────────────

function formatQuestion(q: Record<string, any>, showAnswer = false) {
  return {
    id: q.id,
    text: q.text,
    options: q.options,
    correctOption: showAnswer ? parseInt(q.correct_option, 10) : null,
    marks: q.marks,
    topicId: q.topic_id ?? null,
    imageUrl: q.image_url ?? null,
    textSolution: showAnswer ? (q.text_solution ?? null) : null,
    videoUrl: showAnswer ? (q.video_url ?? null) : null,
    qrCodeSvg: showAnswer ? (q.qr_code_svg ?? null) : null,
    difficulty: q.difficulty,
  };
}

// ── Topic progress helper ─────────────────────────────────────────────────────

async function updateTopicProgress(userId: string, topicId: string, field: string, value: boolean) {
  const { data: existing } = await supabase.from("topic_progress")
    .select("id")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .maybeSingle();

  if (existing) {
    await supabase.from("topic_progress")
      .update({ [field]: value })
      .eq("id", existing.id);
  } else {
    await supabase.from("topic_progress").insert({
      id: nanoid(), user_id: userId, topic_id: topicId, [field]: value,
    });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/exams", requireApproved, async (req, res): Promise<void> => {
  const params = ListExamsQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  let query = supabase.from("exams").select("*");
  if (params.data.type) query = query.eq("type", params.data.type);
  if (params.data.subjectId) query = query.eq("subject_id", params.data.subjectId);
  if (params.data.chapterId) query = query.eq("chapter_id", params.data.chapterId);
  if (params.data.topicId) query = query.eq("topic_id", params.data.topicId);

  const { data: exams } = await query;
  const result = await Promise.all((exams ?? []).map(async (e) => {
    const { count: qCount } = await supabase.from("exam_questions")
      .select("*", { count: "exact", head: true })
      .eq("exam_id", e.id);
    const totalMarks = (qCount ?? 0) * 4;
    const { data: attempt } = await supabase.from("exam_results")
      .select("score")
      .eq("exam_id", e.id)
      .eq("user_id", req.user!.id)
      .maybeSingle();
    const isUnlocked = await computeExamUnlocked(e, req.user!.id);
    return {
      id: e.id, title: e.title, type: e.type,
      subjectId: e.subject_id ?? null, chapterId: e.chapter_id ?? null, topicId: e.topic_id ?? null,
      durationMinutes: e.duration_minutes, totalQuestions: qCount ?? 0, totalMarks,
      passingScore: e.passing_score ?? null, negativeMarking: e.negative_marking,
      isUnlocked, hasAttempted: !!attempt,
      lastScore: attempt?.score ?? null, createdAt: e.created_at,
    };
  }));
  res.json(result);
});

router.post("/exams", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateExamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data as any;
  const { questionIds, ...examData } = d;

  const { data: exam } = await supabase.from("exams").insert({
    id: nanoid(),
    title: examData.title,
    type: examData.type,
    subject_id: examData.subjectId ?? null,
    chapter_id: examData.chapterId ?? null,
    topic_id: examData.topicId ?? null,
    duration_minutes: examData.durationMinutes,
    passing_score: examData.passingScore ?? null,
    negative_marking: examData.negativeMarking ?? 0,
  }).select().single();

  if (questionIds?.length) {
    await supabase.from("exam_questions").insert(
      questionIds.map((qId: string, i: number) => ({ id: nanoid(), exam_id: exam.id, question_id: qId, order: i }))
    );
  }

  res.status(201).json({
    id: exam.id, title: exam.title, type: exam.type,
    subjectId: exam.subject_id ?? null, chapterId: exam.chapter_id ?? null, topicId: exam.topic_id ?? null,
    durationMinutes: exam.duration_minutes, totalQuestions: questionIds?.length ?? 0,
    totalMarks: (questionIds?.length ?? 0) * 4,
    passingScore: exam.passing_score ?? null, negativeMarking: exam.negative_marking,
    isUnlocked: true, hasAttempted: false, lastScore: null, createdAt: exam.created_at,
  });

  if (exam.type !== "drill") {
    setImmediate(async () => {
      try {
        const { data: approvedUsers } = await supabase.from("users")
          .select("id, email, full_name")
          .eq("status", "approved");

        await Promise.allSettled(
          (approvedUsers ?? []).map(async (user) => {
            await createNotification(
              user.id,
              "new_quiz",
              `New quiz available: ${exam.title}`,
              `A new ${exam.type.replace(/_/g, " ")} has been added: "${exam.title}". Open the app to start practising!`,
            );
            await sendNewQuizEmail(user.email, user.full_name, exam.title, exam.type);
          }),
        );
      } catch (err) {
        const { logger } = await import("../lib/logger");
        logger.error({ err, examId: exam.id }, "Failed to send new-quiz notifications");
      }
    });
  }
});

router.delete("/exams/:examId", requireAdmin, async (req, res): Promise<void> => {
  const examId = String(req.params.examId);
  const { data: deleted } = await supabase.from("exams").delete().eq("id", examId).select().maybeSingle();
  if (!deleted) { res.status(404).json({ error: "Exam not found" }); return; }
  res.sendStatus(204);
});

router.get("/exams/:examId/questions", requireApproved, async (req, res): Promise<void> => {
  const examId = String(req.params.examId);
  const { data: examQs } = await supabase.from("exam_questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order");
  if (!examQs || examQs.length === 0) { res.json([]); return; }
  const questionIds = examQs.map((aq) => aq.question_id);
  const { data: questions } = await supabase.from("questions").select("*").in("id", questionIds);
  const ordered = examQs.map((aq) => (questions ?? []).find((q) => q.id === aq.question_id)).filter(Boolean);
  res.json(ordered.map((q) => formatQuestion(q!, false)));
});

router.post("/exams/:examId/questions", requireAdmin, async (req, res): Promise<void> => {
  const examId = String(req.params.examId);
  const { questionId, order } = req.body as { questionId?: string; order?: number };
  if (!questionId) { res.status(400).json({ error: "questionId required" }); return; }
  const { data: exam } = await supabase.from("exams").select("id").eq("id", examId).maybeSingle();
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  const { data: existingRows } = await supabase.from("exam_questions")
    .select("id")
    .eq("exam_id", examId)
    .eq("question_id", String(questionId));
  if (existingRows && existingRows.length > 0) { res.status(409).json({ error: "Question already in exam" }); return; }
  const { count: allQsCount } = await supabase.from("exam_questions")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId);
  await supabase.from("exam_questions").insert({
    id: nanoid(),
    exam_id: examId,
    question_id: String(questionId),
    order: order ?? (allQsCount ?? 0),
  });
  res.status(201).json({ success: true, message: "Question added to exam" });
});

router.delete("/exams/:examId/questions/:questionId", requireAdmin, async (req, res): Promise<void> => {
  const examId = String(req.params.examId);
  const questionId = String(req.params.questionId);
  await supabase.from("exam_questions").delete().eq("exam_id", examId).eq("question_id", questionId);
  res.sendStatus(204);
});

router.get("/exams/:examId", requireApproved, async (req, res): Promise<void> => {
  const params = GetExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { data: exam } = await supabase.from("exams").select("*").eq("id", params.data.examId).maybeSingle();
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const { data: examQs } = await supabase.from("exam_questions")
    .select("*")
    .eq("exam_id", exam.id)
    .order("order");

  const questions = examQs && examQs.length > 0
    ? (await supabase.from("questions").select("*").in("id", examQs.map((q) => q.question_id))).data ?? []
    : [];

  const isUnlocked = await computeExamUnlocked(exam, req.user!.id);

  res.json({
    id: exam.id, title: exam.title, type: exam.type,
    durationMinutes: exam.duration_minutes,
    totalQuestions: questions.length,
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    passingScore: exam.passing_score ?? null,
    negativeMarking: exam.negative_marking,
    isUnlocked,
    questions: questions.map((q) => formatQuestion(q, false)),
  });
});

router.post("/exams/:examId/start", requireApproved, async (req, res): Promise<void> => {
  const params = StartExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { data: exam } = await supabase.from("exams").select("*").eq("id", params.data.examId).maybeSingle();
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  if (exam.type === "chapter_test" && exam.chapter_id) {
    const unlocked = await isChapterTestUnlocked(exam.chapter_id, req.user!.id);
    if (!unlocked) {
      res.status(403).json({
        error: "Chapter Test is locked",
        reason: "Complete all topic tests in this chapter before attempting the Chapter Test.",
      });
      return;
    }
  }

  if (exam.type === "subject_test" && exam.subject_id) {
    const unlocked = await isSubjectTestUnlocked(exam.subject_id, req.user!.id);
    if (!unlocked) {
      res.status(403).json({
        error: "Subject Test is locked",
        reason: "Pass the Chapter Test for every chapter in this subject before attempting the Subject Test.",
      });
      return;
    }
  }

  const { data: configRow } = await supabase.from("system_config")
    .select("value")
    .eq("key", "max_quiz_attempts")
    .maybeSingle();
  const maxAttempts = configRow ? parseInt(configRow.value, 10) : 3;

  const { data: previousAttempts } = await supabase.from("exam_results")
    .select("id")
    .eq("exam_id", exam.id)
    .eq("user_id", req.user!.id);

  if ((previousAttempts?.length ?? 0) >= maxAttempts) {
    res.status(403).json({
      error: `Attempt limit reached`,
      reason: `You have already attempted this exam ${previousAttempts!.length} time${previousAttempts!.length !== 1 ? "s" : ""}. Maximum allowed is ${maxAttempts}.`,
      attemptsUsed: previousAttempts!.length,
      maxAttempts,
    });
    return;
  }

  const now = new Date().toISOString();
  const { data: attempt } = await supabase.from("exam_attempts").insert({
    id: nanoid(),
    user_id: req.user!.id,
    exam_id: exam.id,
    status: "in_progress",
    start_time: now,
    resumed_at: now,
    remaining_seconds: exam.duration_minutes * 60,
    pause_count: 0,
  }).select().single();

  const { data: examQs } = await supabase.from("exam_questions")
    .select("*")
    .eq("exam_id", exam.id)
    .order("order");

  const questions = examQs && examQs.length > 0
    ? (await supabase.from("questions").select("*").in("id", examQs.map((q) => q.question_id))).data ?? []
    : [];

  res.json({
    id: attempt.id, examId: attempt.exam_id, userId: attempt.user_id,
    status: attempt.status, startTime: attempt.start_time,
    pauseCount: attempt.pause_count, remainingSeconds: attempt.remaining_seconds,
    answers: [], questions: questions.map((q) => formatQuestion(q, false)),
  });
});

router.post("/attempts/:attemptId/answer", requireApproved, async (req, res): Promise<void> => {
  const params = SaveAnswerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SaveAnswerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { data: attemptOwner } = await supabase.from("exam_attempts")
    .select("user_id, status")
    .eq("id", params.data.attemptId)
    .maybeSingle();
  if (!attemptOwner) { res.status(404).json({ error: "Attempt not found" }); return; }
  if (attemptOwner.user_id !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
  if (attemptOwner.status === "submitted") { res.status(409).json({ error: "Exam already submitted" }); return; }

  const { data: existing } = await supabase.from("attempt_answers")
    .select("id")
    .eq("attempt_id", params.data.attemptId)
    .eq("question_id", parsed.data.questionId)
    .maybeSingle();

  if (existing) {
    await supabase.from("attempt_answers").update({
      selected_option: parsed.data.selectedOption != null ? String(parsed.data.selectedOption) : null,
      is_marked_for_review: parsed.data.isMarkedForReview,
      time_spent_seconds: parsed.data.timeSpentSeconds,
    }).eq("id", existing.id);
  } else {
    await supabase.from("attempt_answers").insert({
      id: nanoid(),
      attempt_id: params.data.attemptId,
      question_id: parsed.data.questionId,
      selected_option: parsed.data.selectedOption != null ? String(parsed.data.selectedOption) : null,
      is_marked_for_review: parsed.data.isMarkedForReview,
      time_spent_seconds: parsed.data.timeSpentSeconds,
    });
  }

  res.json({ success: true, message: "Answer saved" });
});

router.post("/attempts/:attemptId/submit", requireApproved, async (req, res): Promise<void> => {
  const params = SubmitExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SubmitExamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { data: attempt } = await supabase.from("exam_attempts").select("*").eq("id", params.data.attemptId).maybeSingle();
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }

  if (attempt.user_id !== req.user!.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (attempt.status === "submitted") {
    res.status(409).json({ error: "This exam has already been submitted." });
    return;
  }

  const GRACE_SECONDS = 60;
  const lastActiveAt = attempt.resumed_at ?? attempt.start_time;
  const elapsedSinceResume = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 1000);
  const serverRemainingSeconds = attempt.remaining_seconds - elapsedSinceResume;

  if (serverRemainingSeconds < -GRACE_SECONDS) {
    await supabase.from("exam_attempts")
      .update({ status: "submitted", end_time: new Date().toISOString() })
      .eq("id", attempt.id);
    res.status(400).json({
      error: "Exam time has expired. Your saved answers have been auto-submitted.",
      code: "EXAM_TIME_EXPIRED",
    });
    return;
  }

  const { data: exam } = await supabase.from("exams").select("*").eq("id", attempt.exam_id).maybeSingle();
  const { data: examQs } = await supabase.from("exam_questions").select("question_id").eq("exam_id", exam!.id);
  const questions = examQs && examQs.length > 0
    ? (await supabase.from("questions").select("*").in("id", examQs.map((q) => q.question_id))).data ?? []
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
    const correctOpt = parseInt(q.correct_option, 10);
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
      marksAwarded = -exam!.negative_marking;
      score -= exam!.negative_marking;
    }

    return {
      questionId: q.id, questionText: q.text,
      selectedOption: selected ?? null, correctOption: correctOpt,
      isCorrect, marksAwarded,
      timeSpentSeconds: answer?.timeSpentSeconds ?? 0,
      textSolution: q.text_solution ?? null,
      imageUrl: q.image_url ?? null,
      videoUrl: q.video_url ?? null,
      qrCodeSvg: q.qr_code_svg ?? null,
    };
  });

  const maxScore = questions.reduce((s, q) => s + q.marks, 0);
  const accuracy = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

  let passingThreshold = exam!.passing_score ?? null;
  if (passingThreshold === null && maxScore > 0) {
    const configKey =
      exam!.type === "lecture_quiz" ? "lecture_quiz_passing_score" :
      exam!.type === "topic_test" ? "topic_test_passing_score" :
      exam!.type === "chapter_test" ? "chapter_test_passing_score" :
      null;
    if (configKey) {
      const { data: cfgRow } = await supabase.from("system_config")
        .select("value")
        .eq("key", configKey)
        .maybeSingle();
      const pct = cfgRow ? parseInt(cfgRow.value, 10) : 60;
      passingThreshold = Math.round((pct / 100) * maxScore);
    }
  }
  const passed = passingThreshold !== null ? score >= passingThreshold : score > 0;

  const { data: result } = await supabase.from("exam_results").insert({
    id: nanoid(),
    attempt_id: attempt.id,
    user_id: req.user!.id,
    exam_id: exam!.id,
    score: Math.max(0, score),
    max_score: maxScore,
    accuracy,
    total_questions: questions.length,
    correct_answers: correct,
    incorrect_answers: incorrect,
    skipped_answers: skipped,
    time_taken_seconds: totalTime,
    passed,
    submitted_at: new Date().toISOString(),
  }).select().single();

  await supabase.from("exam_attempts")
    .update({ status: "submitted", end_time: new Date().toISOString() })
    .eq("id", attempt.id);

  if (exam!.type === "lecture_quiz" && exam!.topic_id) {
    await updateTopicProgress(req.user!.id, exam!.topic_id, "lecture_quiz_passed", passed);
  } else if (exam!.type === "dpp" && exam!.topic_id) {
    await updateTopicProgress(req.user!.id, exam!.topic_id, "dpp_completed", true);
  } else if (exam!.type === "pyq" && exam!.topic_id) {
    await updateTopicProgress(req.user!.id, exam!.topic_id, "pyq_completed", true);
  } else if (exam!.type === "topic_test" && exam!.topic_id) {
    await updateTopicProgress(req.user!.id, exam!.topic_id, "topic_test_passed", passed);
  }

  if (exam!.type === "topic_test" && !passed && incorrect > 0) {
    (async () => {
      try {
        await createNotification(
          req.user!.id,
          "exam_reminder",
          "Topic Test Failed — Drill Available",
          `You got ${incorrect} question${incorrect > 1 ? "s" : ""} wrong in "${exam!.title}". Open your results to launch a focused drill on exactly those gaps before retrying.`,
        );
      } catch {}
    })();
  }

  const twStats = new Map<string, { name: string; correct: number; total: number }>();
  for (const q of questions) {
    if (!q.topic_id) continue;
    const stat = twStats.get(q.topic_id) ?? { name: "", correct: 0, total: 0 };
    stat.total++;
    const ans = answerMap.get(q.id);
    if (ans?.selectedOption != null && ans.selectedOption === parseInt(q.correct_option, 10)) stat.correct++;
    twStats.set(q.topic_id, stat);
  }
  const twIds = Array.from(twStats.keys());
  if (twIds.length > 0) {
    const { data: topicRows } = await supabase.from("topics").select("id, name").in("id", twIds);
    for (const t of topicRows ?? []) { const s = twStats.get(t.id); if (s) s.name = t.name; }
  }
  const topicWise = Array.from(twStats.entries()).map(([topicId, s]) => ({
    topicId, topicName: s.name || "Unknown",
    correctAnswers: s.correct, totalQuestions: s.total,
    accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
  }));

  const { data: allPeerResults } = await supabase.from("exam_results")
    .select("score")
    .eq("exam_id", exam!.id);
  const peerTotal = allPeerResults?.length ?? 0;
  const atOrBelow = (allPeerResults ?? []).filter((r) => r.score <= result.score).length;
  const percentile = peerTotal > 0 ? Math.round((atOrBelow / peerTotal) * 100) : 100;

  res.json({
    id: result.id, examId: exam!.id, examTitle: exam!.title, examType: exam!.type,
    score: result.score, maxScore: result.max_score, accuracy: result.accuracy,
    totalQuestions: result.total_questions, correctAnswers: result.correct_answers,
    incorrectAnswers: result.incorrect_answers, skippedAnswers: result.skipped_answers,
    timeTakenSeconds: result.time_taken_seconds, percentile,
    passed: result.passed,
    questionWise,
    topicWise,
    submittedAt: result.submitted_at,
  });
});

router.get("/attempts/:attemptId/sync-time", requireApproved, async (req, res): Promise<void> => {
  const attemptId = String(req.params.attemptId);
  const { data: attempt } = await supabase.from("exam_attempts").select("*").eq("id", attemptId).maybeSingle();
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  if (attempt.user_id !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
  if (attempt.status !== "in_progress") { res.status(409).json({ error: "Exam is not in progress" }); return; }

  const lastActiveAt = attempt.resumed_at ?? attempt.start_time;
  const elapsedSinceResume = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 1000);
  const remainingSeconds = Math.max(0, attempt.remaining_seconds - elapsedSinceResume);

  res.json({ remainingSeconds, serverTime: Date.now() });
});

router.post("/attempts/:attemptId/pause", requireApproved, async (req, res): Promise<void> => {
  const params = PauseExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = PauseExamBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { data: attempt } = await supabase.from("exam_attempts").select("*").eq("id", params.data.attemptId).maybeSingle();
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }

  if (attempt.user_id !== req.user!.id) { res.status(403).json({ error: "Forbidden" }); return; }
  if (attempt.status !== "in_progress") { res.status(409).json({ error: "Exam is not in progress" }); return; }

  const { data: configRow } = await supabase.from("system_config")
    .select("value")
    .eq("key", "max_exam_pauses")
    .maybeSingle();
  const maxPauses = configRow ? parseInt(configRow.value, 10) : 2;

  if (attempt.pause_count >= maxPauses) {
    res.status(403).json({
      error: `Pause limit reached`,
      reason: `You have already paused this exam ${attempt.pause_count} time${attempt.pause_count !== 1 ? "s" : ""}. Maximum allowed is ${maxPauses}.`,
      pausesUsed: attempt.pause_count,
      maxPauses,
    });
    return;
  }

  const newPauseCount = attempt.pause_count + 1;

  await supabase.from("exam_attempts").update({
    status: "paused",
    pause_count: newPauseCount,
    remaining_seconds: body.data.remainingSeconds,
  }).eq("id", attempt.id);

  res.json({
    success: true,
    message: "Exam paused",
    pausesUsed: newPauseCount,
    pausesRemaining: maxPauses - newPauseCount,
    maxPauses,
  });
});

router.post("/attempts/:attemptId/resume", requireApproved, async (req, res): Promise<void> => {
  const params = ResumeExamParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { data: attempt } = await supabase.from("exam_attempts").select("*").eq("id", params.data.attemptId).maybeSingle();
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }

  await supabase.from("exam_attempts").update({
    status: "in_progress",
    resumed_at: new Date().toISOString(),
  }).eq("id", attempt.id);

  const { data: examQs } = await supabase.from("exam_questions")
    .select("*")
    .eq("exam_id", attempt.exam_id)
    .order("order");

  const questions = examQs && examQs.length > 0
    ? (await supabase.from("questions").select("*").in("id", examQs.map((q) => q.question_id))).data ?? []
    : [];

  const { data: answers } = await supabase.from("attempt_answers").select("*").eq("attempt_id", attempt.id);

  res.json({
    id: attempt.id, examId: attempt.exam_id, userId: attempt.user_id,
    status: "in_progress", startTime: attempt.start_time,
    pauseCount: attempt.pause_count, remainingSeconds: attempt.remaining_seconds,
    answers: (answers ?? []).map((a) => ({
      questionId: a.question_id,
      selectedOption: a.selected_option != null ? parseInt(a.selected_option, 10) : null,
      isMarkedForReview: a.is_marked_for_review,
      timeSpentSeconds: a.time_spent_seconds,
    })),
    questions: questions.map((q) => formatQuestion(q, false)),
  });
});

router.get("/results/:resultId", requireApproved, async (req, res): Promise<void> => {
  const params = GetResultParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { data: result } = await supabase.from("exam_results").select("*").eq("id", params.data.resultId).maybeSingle();
  if (!result) { res.status(404).json({ error: "Result not found" }); return; }

  const { data: exam } = await supabase.from("exams").select("*").eq("id", result.exam_id).maybeSingle();
  const { data: examQs } = await supabase.from("exam_questions").select("question_id").eq("exam_id", result.exam_id);
  const questions = examQs && examQs.length > 0
    ? (await supabase.from("questions").select("*").in("id", examQs.map((q) => q.question_id))).data ?? []
    : [];

  const { data: answers } = await supabase.from("attempt_answers")
    .select("*")
    .eq("attempt_id", result.attempt_id);
  const answerMap = new Map((answers ?? []).map((a) => [a.question_id, a]));

  const questionWise = questions.map((q) => {
    const a = answerMap.get(q.id);
    const selected = a?.selected_option != null ? parseInt(a.selected_option, 10) : null;
    const correctOpt = parseInt(q.correct_option, 10);
    const isCorrect = selected === correctOpt;
    return {
      questionId: q.id, questionText: q.text,
      selectedOption: selected, correctOption: correctOpt,
      isCorrect, marksAwarded: isCorrect ? q.marks : (selected != null ? -(exam?.negative_marking ?? 0) : 0),
      timeSpentSeconds: a?.time_spent_seconds ?? 0,
      textSolution: q.text_solution ?? null,
      imageUrl: q.image_url ?? null,
      videoUrl: q.video_url ?? null,
      qrCodeSvg: q.qr_code_svg ?? null,
    };
  });

  const { data: allPeerResults } = await supabase.from("exam_results")
    .select("score")
    .eq("exam_id", result.exam_id);
  const peerTotal = allPeerResults?.length ?? 0;
  const atOrBelow = (allPeerResults ?? []).filter((r) => r.score <= result.score).length;
  const percentile = peerTotal > 0 ? Math.round((atOrBelow / peerTotal) * 100) : 100;

  res.json({
    id: result.id, examId: exam?.id ?? result.exam_id,
    examTitle: exam?.title ?? "Unknown", examType: exam?.type ?? "grand_test",
    score: result.score, maxScore: result.max_score, accuracy: result.accuracy,
    totalQuestions: result.total_questions, correctAnswers: result.correct_answers,
    incorrectAnswers: result.incorrect_answers, skippedAnswers: result.skipped_answers,
    timeTakenSeconds: result.time_taken_seconds, percentile,
    passed: result.passed, questionWise,
    submittedAt: result.submitted_at,
  });
});

router.get("/results", requireApproved, async (req, res): Promise<void> => {
  const { data: results } = await supabase.from("exam_results")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("submitted_at", { ascending: false });

  const formatted = await Promise.all((results ?? []).map(async (r) => {
    const { data: exam } = await supabase.from("exams").select("title, type").eq("id", r.exam_id).maybeSingle();
    return {
      id: r.id, examId: r.exam_id,
      examTitle: exam?.title ?? "Unknown", examType: exam?.type ?? "grand_test",
      score: r.score, maxScore: r.max_score, accuracy: r.accuracy,
      passed: r.passed, submittedAt: r.submitted_at,
    };
  }));

  res.json(formatted);
});

export default router;
