import { eq, inArray, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  db,
  examAttemptsTable,
  examsTable,
  examQuestionsTable,
  questionsTable,
  attemptAnswersTable,
  examResultsTable,
  topicProgressTable,
} from "@workspace/db";
import { logger } from "./logger";

async function updateTopicProgress(
  userId: string,
  topicId: string,
  field: string,
  value: boolean,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(topicProgressTable)
    .where(
      and(
        eq(topicProgressTable.userId, userId),
        eq(topicProgressTable.topicId, topicId),
      ),
    );

  if (existing) {
    await db
      .update(topicProgressTable)
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

async function autoSubmitAttempt(
  attempt: typeof examAttemptsTable.$inferSelect,
): Promise<void> {
  const [exam] = await db
    .select()
    .from(examsTable)
    .where(eq(examsTable.id, attempt.examId));

  if (!exam) return;

  const examQs = await db
    .select()
    .from(examQuestionsTable)
    .where(eq(examQuestionsTable.examId, exam.id));

  const questions =
    examQs.length > 0
      ? await db
          .select()
          .from(questionsTable)
          .where(
            inArray(
              questionsTable.id,
              examQs.map((q) => q.questionId),
            ),
          )
      : [];

  const savedAnswers = await db
    .select()
    .from(attemptAnswersTable)
    .where(eq(attemptAnswersTable.attemptId, attempt.id));

  const answerMap = new Map(
    savedAnswers.map((a) => [
      a.questionId,
      {
        selectedOption:
          a.selectedOption != null ? parseInt(a.selectedOption, 10) : null,
        timeSpentSeconds: a.timeSpentSeconds,
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
    const correctOpt = parseInt(q.correctOption, 10);

    totalTime += answer?.timeSpentSeconds ?? 0;

    if (selected == null) {
      skipped++;
    } else if (selected === correctOpt) {
      correct++;
      score += q.marks;
    } else {
      incorrect++;
      score -= exam.negativeMarking;
    }
  }

  const maxScore = questions.reduce((s, q) => s + q.marks, 0);
  const accuracy =
    questions.length > 0
      ? Math.round((correct / questions.length) * 100)
      : 0;
  const passed = exam.passingScore ? score >= exam.passingScore : score > 0;
  const submittedAt = new Date();

  await db.insert(examResultsTable).values({
    id: nanoid(),
    attemptId: attempt.id,
    userId: attempt.userId,
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
    submittedAt,
  });

  await db
    .update(examAttemptsTable)
    .set({ status: "auto_submitted", endTime: submittedAt })
    .where(eq(examAttemptsTable.id, attempt.id));

  if (exam.type === "lecture_quiz" && exam.topicId) {
    await updateTopicProgress(attempt.userId, exam.topicId, "lectureQuizPassed", passed);
  } else if (exam.type === "dpp" && exam.topicId) {
    await updateTopicProgress(attempt.userId, exam.topicId, "dppCompleted", true);
  } else if (exam.type === "pyq" && exam.topicId) {
    await updateTopicProgress(attempt.userId, exam.topicId, "pyqCompleted", true);
  } else if (exam.type === "topic_test" && exam.topicId) {
    await updateTopicProgress(attempt.userId, exam.topicId, "topicTestPassed", passed);
  }

  logger.info(
    {
      attemptId: attempt.id,
      userId: attempt.userId,
      examId: exam.id,
      score: Math.max(0, score),
      passed,
    },
    "Exam auto-submitted by sweep",
  );
}

/**
 * Sweep all in_progress attempts whose deadline has passed and auto-submit them.
 * Deadline = resumedAt + remainingSeconds (both set at start and on every resume).
 * Falls back to startTime when resumedAt is null (legacy rows).
 */
export async function sweepExpiredAttempts(): Promise<void> {
  try {
    const activeAttempts = await db
      .select()
      .from(examAttemptsTable)
      .where(eq(examAttemptsTable.status, "in_progress"));

    const now = Date.now();

    for (const attempt of activeAttempts) {
      const clockStart = attempt.resumedAt ?? attempt.startTime;
      const deadlineMs =
        clockStart.getTime() + attempt.remainingSeconds * 1000;

      if (now >= deadlineMs) {
        await autoSubmitAttempt(attempt);
      }
    }
  } catch (err) {
    logger.error({ err }, "Error in sweepExpiredAttempts");
  }
}
