import { Router, type IRouter } from "express";
import { requireApproved } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

function calcStreak(sessions: { start_time: string }[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map((s) => new Date(s.start_time).toDateString()));
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

  const { data: users } = await supabase.from("users").select("*").eq("status", "approved");

  const entries = await Promise.all(
    (users ?? []).map(async (u) => {
      const { data: progress } = await supabase.from("topic_progress").select("*").eq("user_id", u.id);
      const topicsCompleted = (progress ?? []).filter((p) => p.topic_test_passed).length;

      const { data: results } = await supabase.from("exam_results").select("*").eq("user_id", u.id);
      const avgAccuracy = results && results.length > 0
        ? results.reduce((sum, r) => sum + r.accuracy, 0) / results.length
        : 0;
      const examsAttempted = results?.length ?? 0;
      const examsPassed = (results ?? []).filter((r) => r.passed).length;

      const { data: sessions } = await supabase.from("pomodoro_sessions").select("start_time, duration_seconds").eq("user_id", u.id);
      const streakDays = calcStreak(sessions ?? []);
      const totalFocusMinutes = Math.round(
        (sessions ?? []).reduce((sum, s) => sum + s.duration_seconds, 0) / 60,
      );

      const score = Math.round(
        topicsCompleted * 10 +
        avgAccuracy * 2 +
        streakDays * 5 +
        Math.min(totalFocusMinutes / 30, 50),
      );

      return {
        userId: u.id,
        fullName: u.full_name,
        photoB2Key: u.photo_b2_key ?? null,
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
