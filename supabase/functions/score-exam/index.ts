import { handleCors, json, err } from "../_shared/cors.ts";
import { requireApproved, adminClient } from "../_shared/auth.ts";

type Answer = {
  questionId: string;
  selectedOption: number | null | undefined;
  timeSpentSeconds: number;
};

const GRACE_SECONDS = 60;

async function updateTopicProgress(
  db: ReturnType<typeof adminClient>,
  userId: string,
  topicId: string,
  field: string,
  value: boolean,
): Promise<void> {
  const { data: existing } = await db
    .from("topic_progress")
    .select("id")
    .eq("user_id", userId)
    .eq("topic_id", topicId)
    .maybeSingle();

  if (existing) {
    await db.from("topic_progress").update({ [field]: value }).eq("id", existing.id);
  } else {
    await db.from("topic_progress").insert({
      id: crypto.randomUUID(),
      user_id: userId,
      topic_id: topicId,
      [field]: value,
    });
  }
}

async function createNotification(
  db: ReturnType<typeof adminClient>,
  userId: string,
  type: string,
  title: string,
  message: string,
): Promise<void> {
  await db.from("notifications").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    type,
    title,
    message,
    is_read: false,
  });
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") return err("Method not allowed", 405);

  const user = await requireApproved(req);
  if (!user) return err("Unauthorized — approved account required", 401);

  const url = new URL(req.url);
  const attemptId = url.pathname.split("/").filter(Boolean).pop();
  if (!attemptId) return err("attemptId is required in URL path (/score-exam/{attemptId})", 400);

  let body: { answers: Answer[] };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { answers } = body;
  if (!Array.isArray(answers)) return err("answers must be an array");

  const db = adminClient();

  const { data: attempt } = await db
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();

  if (!attempt) return err("Attempt not found", 404);
  if (attempt.user_id !== user.userId) return err("Forbidden", 403);
  if (attempt.status === "submitted") {
    return err("This exam has already been submitted.", 409);
  }

  const lastActiveAt = attempt.resumed_at ?? attempt.start_time;
  const elapsedSinceResume = Math.floor(
    (Date.now() - new Date(lastActiveAt).getTime()) / 1000,
  );
  const serverRemainingSeconds = attempt.remaining_seconds - elapsedSinceResume;

  if (serverRemainingSeconds < -GRACE_SECONDS) {
    await db
      .from("exam_attempts")
      .update({ status: "submitted", end_time: new Date().toISOString() })
      .eq("id", attempt.id);
    return err("Exam time has expired. Your saved answers have been auto-submitted.", 400);
  }

  const { data: exam } = await db
    .from("exams")
    .select("*")
    .eq("id", attempt.exam_id)
    .maybeSingle();

  if (!exam) return err("Exam not found", 404);

  const { data: examQs } = await db
    .from("exam_questions")
    .select("question_id")
    .eq("exam_id", exam.id);

  const questions =
    examQs && examQs.length > 0
      ? (
          await db
            .from("questions")
            .select("*")
            .in(
              "id",
              examQs.map((q: { question_id: string }) => q.question_id),
            )
        ).data ?? []
      : [];

  const answerMap = new Map<string, Answer>(
    answers.map((a) => [a.questionId, a]),
  );

  let score = 0;
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  const totalTime = answers.reduce((s, a) => s + (a.timeSpentSeconds ?? 0), 0);

  const questionWise = (questions as Record<string, unknown>[]).map((q) => {
    const answer = answerMap.get(q.id as string);
    const selected = answer?.selectedOption;
    const correctOpt = parseInt(String(q.correct_option), 10);
    let isCorrect = false;
    let marksAwarded = 0;

    if (selected == null || selected === undefined) {
      skipped++;
    } else if (selected === correctOpt) {
      isCorrect = true;
      correct++;
      marksAwarded = q.marks as number;
      score += q.marks as number;
    } else {
      incorrect++;
      marksAwarded = -(exam.negative_marking as number);
      score -= exam.negative_marking as number;
    }

    return {
      questionId: q.id,
      questionText: q.text,
      selectedOption: selected ?? null,
      correctOption: correctOpt,
      isCorrect,
      marksAwarded,
      timeSpentSeconds: answer?.timeSpentSeconds ?? 0,
      textSolution: (q.text_solution as string) ?? null,
      imageUrl: (q.image_url as string) ?? null,
      videoUrl: (q.video_url as string) ?? null,
      qrCodeSvg: (q.qr_code_svg as string) ?? null,
    };
  });

  const maxScore = (questions as Record<string, unknown>[]).reduce(
    (s, q) => s + (q.marks as number),
    0,
  );
  const accuracy =
    questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

  let passingThreshold: number | null = exam.passing_score ?? null;
  if (passingThreshold === null && maxScore > 0) {
    const configKey =
      exam.type === "lecture_quiz"
        ? "lecture_quiz_passing_score"
        : exam.type === "topic_test"
          ? "topic_test_passing_score"
          : exam.type === "chapter_test"
            ? "chapter_test_passing_score"
            : null;

    if (configKey) {
      const { data: cfgRow } = await db
        .from("system_config")
        .select("value")
        .eq("key", configKey)
        .maybeSingle();
      const pct = cfgRow ? parseInt(String(cfgRow.value), 10) : 60;
      passingThreshold = Math.round((pct / 100) * maxScore);
    }
  }
  const passed =
    passingThreshold !== null ? score >= passingThreshold : score > 0;

  const resultId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();

  const { data: result, error: resultError } = await db
    .from("exam_results")
    .insert({
      id: resultId,
      attempt_id: attempt.id,
      user_id: user.userId,
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
    })
    .select()
    .single();

  if (resultError) {
    console.error("[score-exam] insert exam_results failed:", resultError);
    return err("Failed to save exam result", 500);
  }

  await db
    .from("exam_attempts")
    .update({ status: "submitted", end_time: submittedAt })
    .eq("id", attempt.id);

  if (exam.type === "lecture_quiz" && exam.topic_id) {
    await updateTopicProgress(db, user.userId, exam.topic_id, "lecture_quiz_passed", passed);
  } else if (exam.type === "dpp" && exam.topic_id) {
    await updateTopicProgress(db, user.userId, exam.topic_id, "dpp_completed", true);
  } else if (exam.type === "pyq" && exam.topic_id) {
    await updateTopicProgress(db, user.userId, exam.topic_id, "pyq_completed", true);
  } else if (exam.type === "topic_test" && exam.topic_id) {
    await updateTopicProgress(db, user.userId, exam.topic_id, "topic_test_passed", passed);
  }

  if (exam.type === "topic_test" && !passed && incorrect > 0) {
    await createNotification(
      db,
      user.userId,
      "exam_reminder",
      "Topic Test Failed — Drill Available",
      `You got ${incorrect} question${incorrect > 1 ? "s" : ""} wrong in "${exam.title}". Open your results to launch a focused drill on exactly those gaps before retrying.`,
    ).catch((e) =>
      console.error("[score-exam] notification failed:", e),
    );
  }

  return json({
    id: result.id,
    attemptId: result.attempt_id,
    userId: result.user_id,
    examId: result.exam_id,
    score: result.score,
    maxScore: result.max_score,
    accuracy: result.accuracy,
    totalQuestions: result.total_questions,
    correctAnswers: result.correct_answers,
    incorrectAnswers: result.incorrect_answers,
    skippedAnswers: result.skipped_answers,
    timeTakenSeconds: result.time_taken_seconds,
    passed: result.passed,
    submittedAt: result.submitted_at,
    questions: questionWise,
  });
});
