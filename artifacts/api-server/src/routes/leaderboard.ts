import { Router, type IRouter } from "express";
import {
  db, usersTable, topicProgressTable, examResultsTable, pomodoroSessionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireApproved } from "../lib/auth";

const router: IRouter = Router();

function calcStreak(sessions: { startTime: Date }[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => s.startTime.toDateString()));
  const sorted = Array.from(days)
    .map((d) => new Date(d))
    .sort((a, b) => b.getTime() - a.getTime());

  let streak = 0;
  const check = new Date();
  check.setHours(0, 0, 0, 0);

  for (const day of sorted) {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === check.getTime()) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else if (d.getTime() < check.getTime()) {
      break;
    }
  }
  return streak;
}

router.get("/leaderboard", requireApproved, async (req, res): Promise<void> => {
  const currentUserId = req.user!.id;

  const users = await db.select().from(usersTable).where(eq(usersTable.status, "approved"));

  const entries = await Promise.all(
    users.map(async (u) => {
      const progress = await db.select().from(topicProgressTable)
        .where(eq(topicProgressTable.userId, u.id));
      const topicsCompleted = progress.filter((p) => p.topicTestPassed).length;

      const results = await db.select().from(examResultsTable)
        .where(eq(examResultsTable.userId, u.id));
      const avgAccuracy = results.length > 0
        ? results.reduce((sum, r) => sum + r.accuracy, 0) / results.length
        : 0;
      const examsAttempted = results.length;
      const examsPassed = results.filter((r) => r.passed).length;

      const sessions = await db.select().from(pomodoroSessionsTable)
        .where(eq(pomodoroSessionsTable.userId, u.id));
      const streakDays = calcStreak(sessions);
      const totalFocusMinutes = Math.round(
        sessions.reduce((sum, s) => sum + s.durationSeconds, 0) / 60,
      );

      const score = Math.round(
        topicsCompleted * 10 +
        avgAccuracy * 2 +
        streakDays * 5 +
        Math.min(totalFocusMinutes / 30, 50),
      );

      return {
        userId: u.id,
        fullName: u.fullName,
        photoB2Key: u.photoB2Key ?? null,
        topicsCompleted,
        avgAccuracy: Math.round(avgAccuracy * 10) / 10,
        streakDays,
        totalFocusMinutes,
        examsAttempted,
        examsPassed,
        score,
        isCurrentUser: u.id === currentUserId,
      };
    }),
  );

  entries.sort((a, b) => b.score - a.score || b.topicsCompleted - a.topicsCompleted);
  const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  res.json(ranked);
});

export default router;
