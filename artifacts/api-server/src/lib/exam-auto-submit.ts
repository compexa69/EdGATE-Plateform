import { nanoid } from "nanoid";
import { logger } from "./logger";
import { supabase } from "./supabase";

async function updateTopicProgress(
  userId: string,
  topicId: string,
  field: string,
  value: boolean,
): Promise<void> {
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
      id: nanoid(),
      user_id: userId,
      topic_id: topicId,
      [field]: value,
    });
  }
}

async function autoSubmitAttempt(attempt: Record<string, any>): Promise<void> {
  const { data: exam } = await supabase.from("exams").select("*").eq("id", attempt.exam_id).maybeSingle();
  if (!exam) return;

  const { data: examQs } = await supabase.from("exam_questions").select("question_id").eq("exam_id", exam.id);
  const questionIds = (examQs ?? []).map((q) => q.question_id);

  const questions = questionIds.length > 0
    ? (await supabase.from("questions").select("*").in("id", questionIds)).data ?? []
    : [];

  const { data: savedAnswers } = await supabase.from("attempt_answers").select("*").eq("attempt_id", attempt.id);

  const answerMap = new Map(
    (savedAnswers ?? []).map((a) => [
      a.question_id,
      {
        selectedOption: a.selected_option != null ? parseInt(a.selected_option, 10) : null,
        timeSpentSeconds: a.time_spent_seconds,
      },
    ]),
  );

  let score = 0;
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let totalTime = 0;

  for (const q of questions) {
    const answer = answerMap.get(q.id);
    const selected = answer?.selectedOption ?? null;
    const correctOpt = parseInt(q.correct_option, 10);

    totalTime += answer?.timeSpentSeconds ?? 0;

    if (selected == null) {
      skipped++;
    } else if (selected === correctOpt) {
      correct++;
      score += q.marks;
    } else {
      incorrect++;
      score -= exam.negative_marking;
    }
  }

  const maxScore = questions.reduce((s, q) => s + q.marks, 0);
  const accuracy = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
  const passed = exam.passing_score ? score >= exam.passing_score : score > 0;
  const submittedAt = new Date().toISOString();

  await supabase.from("exam_results").insert({
    id: nanoid(),
    attempt_id: attempt.id,
    user_id: attempt.user_id,
    exam_id: exam.id,
    score: Math.max(0, score),
    max_score: maxScore,
    accuracy,
    total_questions: questions.length,
    correct_answers: correct,
    incorrect_answers: incorrect,
    skipped_answers: skipped,
    time_taken_seconds: totalTime,
    passed,
    submitted_at: submittedAt,
  });

  await supabase.from("exam_attempts")
    .update({ status: "auto_submitted", end_time: submittedAt })
    .eq("id", attempt.id);

  if (exam.type === "lecture_quiz" && exam.topic_id) {
    await updateTopicProgress(attempt.user_id, exam.topic_id, "lecture_quiz_passed", passed);
  } else if (exam.type === "dpp" && exam.topic_id) {
    await updateTopicProgress(attempt.user_id, exam.topic_id, "dpp_completed", true);
  } else if (exam.type === "pyq" && exam.topic_id) {
    await updateTopicProgress(attempt.user_id, exam.topic_id, "pyq_completed", true);
  } else if (exam.type === "topic_test" && exam.topic_id) {
    await updateTopicProgress(attempt.user_id, exam.topic_id, "topic_test_passed", passed);
  }

  logger.info(
    {
      attemptId: attempt.id,
      userId: attempt.user_id,
      examId: exam.id,
      score: Math.max(0, score),
      passed,
    },
    "Exam auto-submitted by sweep",
  );
}

export async function sweepExpiredAttempts(): Promise<void> {
  try {
    const { data: activeAttempts } = await supabase.from("exam_attempts")
      .select("*")
      .eq("status", "in_progress");

    const now = Date.now();

    for (const attempt of activeAttempts ?? []) {
      const clockStart = attempt.resumed_at ?? attempt.start_time;
      const deadlineMs = new Date(clockStart).getTime() + attempt.remaining_seconds * 1000;

      if (now >= deadlineMs) {
        await autoSubmitAttempt(attempt);
      }
    }
  } catch (err) {
    logger.error({ err }, "Error in sweepExpiredAttempts");
  }
}
