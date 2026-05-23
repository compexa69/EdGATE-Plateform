import { handleCors, json, err } from "../_shared/cors.ts";
import { requireApproved, adminClient } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET" && req.method !== "POST") return err("Method not allowed", 405);

  const caller = await requireApproved(req);
  if (!caller) return err("Unauthorized or not approved", 401);

  const db = adminClient();

  const [
    { data: users },
    { data: topicProgress },
    { data: examResults },
    { data: pomodoro },
  ] = await Promise.all([
    db
      .from("users")
      .select("id, full_name, photo_b2_key")
      .eq("status", "approved"),
    db
      .from("topic_progress")
      .select("user_id, topic_test_passed"),
    db
      .from("exam_results")
      .select("user_id, passed, accuracy, submitted_at"),
    db
      .from("pomodoro_sessions")
      .select("user_id, duration_minutes"),
  ]);

  const topicsCompletedByUser = new Map<string, number>();
  for (const p of topicProgress ?? []) {
    if (p.topic_test_passed) {
      topicsCompletedByUser.set(p.user_id, (topicsCompletedByUser.get(p.user_id) ?? 0) + 1);
    }
  }

  const accuracyByUser = new Map<string, { total: number; count: number }>();
  const examsByUser = new Map<string, { attempted: number; passed: number; dates: string[] }>();
  for (const r of examResults ?? []) {
    const acc = accuracyByUser.get(r.user_id) ?? { total: 0, count: 0 };
    accuracyByUser.set(r.user_id, { total: acc.total + r.accuracy, count: acc.count + 1 });

    const ex = examsByUser.get(r.user_id) ?? { attempted: 0, passed: 0, dates: [] };
    ex.attempted++;
    if (r.passed) ex.passed++;
    ex.dates.push(r.submitted_at);
    examsByUser.set(r.user_id, ex);
  }

  const focusByUser = new Map<string, number>();
  for (const p of pomodoro ?? []) {
    focusByUser.set(p.user_id, (focusByUser.get(p.user_id) ?? 0) + (p.duration_minutes ?? 0));
  }

  function computeStreak(dates: string[]): number {
    if (dates.length === 0) return 0;
    const uniqueDates = [...new Set(dates.map((d) => d.split("T")[0]))].sort().reverse();
    let streak = 0;
    let current = new Date();
    current.setHours(0, 0, 0, 0);
    for (const dateStr of uniqueDates) {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      const diff = Math.round((current.getTime() - d.getTime()) / 86400000);
      if (diff === streak) { streak++; current = d; }
      else break;
    }
    return streak;
  }

  const entries = (users ?? []).map((u: { id: string; full_name: string; photo_b2_key: string | null }) => {
    const topicsCompleted = topicsCompletedByUser.get(u.id) ?? 0;
    const accData = accuracyByUser.get(u.id);
    const avgAccuracy = accData && accData.count > 0
      ? Math.round(accData.total / accData.count)
      : 0;
    const exData = examsByUser.get(u.id) ?? { attempted: 0, passed: 0, dates: [] };
    const streakDays = computeStreak(exData.dates);
    const totalFocusMinutes = focusByUser.get(u.id) ?? 0;
    const totalFocusHours = totalFocusMinutes / 60;

    const score =
      topicsCompleted * 10 +
      avgAccuracy * 2 +
      streakDays * 5 +
      Math.min(50, Math.round(totalFocusHours * 5));

    return {
      userId: u.id,
      fullName: u.full_name,
      photoB2Key: u.photo_b2_key,
      photoUrl: null as string | null,
      topicsCompleted,
      avgAccuracy,
      streakDays,
      totalFocusMinutes,
      examsAttempted: exData.attempted,
      examsPassed: exData.passed,
      score,
      isCurrentUser: u.id === caller.userId,
    };
  });

  entries.sort((a, b) => b.score - a.score);

  const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  return json(ranked);
});
