import { Router, type IRouter } from "express";
import { db, pomodoroSessionsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ListPomodoroSessionsQueryParams,
  CreatePomodoroSessionBody,
} from "@workspace/api-zod";
import { requireApproved } from "../lib/auth";

const router: IRouter = Router();

router.get("/pomodoro/sessions", requireApproved, async (req, res): Promise<void> => {
  const params = ListPomodoroSessionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sessions = await db.select().from(pomodoroSessionsTable)
    .where(eq(pomodoroSessionsTable.userId, req.user!.id));

  res.json(sessions.map((s) => ({
    id: s.id, userId: s.userId, durationSeconds: s.durationSeconds,
    topicContext: s.topicContext ?? null, topicId: s.topicId ?? null,
    startTime: s.startTime.toISOString(), endTime: s.endTime.toISOString(),
  })));
});

router.post("/pomodoro/sessions", requireApproved, async (req, res): Promise<void> => {
  const parsed = CreatePomodoroSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.insert(pomodoroSessionsTable).values({
    id: nanoid(),
    userId: req.user!.id,
    durationSeconds: parsed.data.durationSeconds,
    topicContext: parsed.data.topicContext,
    topicId: parsed.data.topicId,
    startTime: new Date(parsed.data.startTime),
    endTime: new Date(parsed.data.endTime),
  }).returning();

  res.status(201).json({
    id: session.id, userId: session.userId, durationSeconds: session.durationSeconds,
    topicContext: session.topicContext ?? null, topicId: session.topicId ?? null,
    startTime: session.startTime.toISOString(), endTime: session.endTime.toISOString(),
  });
});

router.get("/pomodoro/stats", requireApproved, async (req, res): Promise<void> => {
  const sessions = await db.select().from(pomodoroSessionsTable)
    .where(eq(pomodoroSessionsTable.userId, req.user!.id));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todayMinutes = Math.round(
    sessions.filter((s) => s.startTime >= today)
      .reduce((sum, s) => sum + s.durationSeconds, 0) / 60
  );

  const weekMinutes = Math.round(
    sessions.filter((s) => s.startTime >= weekAgo)
      .reduce((sum, s) => sum + s.durationSeconds, 0) / 60
  );

  const uniqueDays = new Set(sessions.map((s) => s.startTime.toDateString()));
  const dayList = Array.from(uniqueDays).sort().reverse();
  let streak = 0;
  const checkDate = new Date(today);
  for (const day of dayList) {
    if (new Date(day).toDateString() === checkDate.toDateString()) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  res.json({
    todayMinutes,
    weekMinutes,
    currentStreakDays: streak,
    longestStreakDays: streak,
    totalSessions: sessions.length,
    goalMinutesPerDay: 120,
  });
});

export default router;
