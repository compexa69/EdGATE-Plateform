import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import {
  ListPomodoroSessionsQueryParams,
  CreatePomodoroSessionBody,
} from "@workspace/api-zod";
import { requireApproved } from "../lib/auth";
import { createNotification } from "./notifications";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

const STREAK_MILESTONES = [7, 30, 100] as const;

function streakMessage(days: number): string {
  if (days === 7)   return "One full week of consistent study sessions — you're building a powerful habit. Keep showing up!";
  if (days === 30)  return "30 days straight! A whole month of daily focus. You're in elite territory now. Don't stop.";
  if (days === 100) return "100 consecutive days of study. Legendary discipline — JEE/NEET toppers are forged exactly like this. 🏆";
  return `${days}-day streak achieved! Incredible consistency.`;
}

function calcStreak(sessions: { start_time: string }[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const uniqueDays = new Set(sessions.map((s) => new Date(s.start_time).toDateString()));
  const dayList = Array.from(uniqueDays).sort().reverse();

  let streak = 0;
  const checkDate = new Date(today);
  for (const day of dayList) {
    if (new Date(day).toDateString() === checkDate.toDateString()) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }
  return streak;
}

router.get("/pomodoro/sessions", requireApproved, async (req, res): Promise<void> => {
  const params = ListPomodoroSessionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data: sessions } = await supabase.from("pomodoro_sessions")
    .select("*")
    .eq("user_id", req.user!.id);

  res.json((sessions ?? []).map((s) => ({
    id: s.id, userId: s.user_id, durationSeconds: s.duration_seconds,
    topicContext: s.topic_context ?? null, topicId: s.topic_id ?? null,
    startTime: s.start_time, endTime: s.end_time,
  })));
});

router.post("/pomodoro/sessions", requireApproved, async (req, res): Promise<void> => {
  const parsed = CreatePomodoroSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data: session } = await supabase.from("pomodoro_sessions").insert({
    id: nanoid(),
    user_id: req.user!.id,
    duration_seconds: parsed.data.durationSeconds,
    topic_context: parsed.data.topicContext,
    topic_id: parsed.data.topicId,
    start_time: new Date(parsed.data.startTime).toISOString(),
    end_time: new Date(parsed.data.endTime).toISOString(),
  }).select().single();

  res.status(201).json({
    id: session.id, userId: session.user_id, durationSeconds: session.duration_seconds,
    topicContext: session.topic_context ?? null, topicId: session.topic_id ?? null,
    startTime: session.start_time, endTime: session.end_time,
  });

  const userId = req.user!.id;
  (async () => {
    try {
      const { data: allSessions } = await supabase.from("pomodoro_sessions")
        .select("start_time")
        .eq("user_id", userId);

      const streak = calcStreak(allSessions ?? []);

      for (const milestone of STREAK_MILESTONES) {
        if (streak === milestone) {
          const milestoneTitle = `${milestone}-Day Streak!`;

          const { data: existing } = await supabase.from("notifications")
            .select("id")
            .eq("user_id", userId)
            .eq("type", "streak_milestone")
            .eq("title", milestoneTitle)
            .limit(1)
            .maybeSingle();

          if (!existing) {
            await createNotification(userId, "streak_milestone", milestoneTitle, streakMessage(milestone));
          }
          break;
        }
      }
    } catch {
      // non-critical
    }
  })();
});

router.get("/pomodoro/stats", requireApproved, async (req, res): Promise<void> => {
  const { data: sessions } = await supabase.from("pomodoro_sessions")
    .select("*")
    .eq("user_id", req.user!.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todayMinutes = Math.round(
    (sessions ?? []).filter((s) => new Date(s.start_time) >= today)
      .reduce((sum, s) => sum + s.duration_seconds, 0) / 60
  );

  const weekMinutes = Math.round(
    (sessions ?? []).filter((s) => new Date(s.start_time) >= weekAgo)
      .reduce((sum, s) => sum + s.duration_seconds, 0) / 60
  );

  const streak = calcStreak(sessions ?? []);

  res.json({
    todayMinutes,
    weekMinutes,
    currentStreakDays: streak,
    longestStreakDays: streak,
    totalSessions: sessions?.length ?? 0,
    goalMinutesPerDay: 120,
  });
});

export default router;
