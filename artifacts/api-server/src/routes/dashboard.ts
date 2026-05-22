import { Router, type IRouter } from "express";
import { requireApproved } from "../lib/auth";
import { formatUser } from "./auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

async function computeWeakTopics(userId: string, filterTopicIds?: Set<string>) {
  const { data: results } = await supabase.from("exam_results").select("*").eq("user_id", userId);
  if (!results || results.length === 0) return [];

  const examIds = [...new Set(results.map((r) => r.exam_id))];
  const { data: exams } = await supabase.from("exams").select("id, topic_id").in("id", examIds);

  const topicAccuracies = new Map<string, number[]>();
  for (const r of results) {
    const ex = (exams ?? []).find((e) => e.id === r.exam_id);
    if (!ex?.topic_id) continue;
    if (filterTopicIds && !filterTopicIds.has(ex.topic_id)) continue;
    const arr = topicAccuracies.get(ex.topic_id) ?? [];
    arr.push(r.accuracy);
    topicAccuracies.set(ex.topic_id, arr);
  }

  const weakTopicIds = Array.from(topicAccuracies.entries())
    .filter(([, accs]) => accs.reduce((a, b) => a + b, 0) / accs.length < 50)
    .map(([id]) => id);

  if (weakTopicIds.length === 0) return [];

  const { data: topics } = await supabase.from("topics").select("id, name, chapter_id").in("id", weakTopicIds);
  const chapterIds = [...new Set((topics ?? []).map((t) => t.chapter_id))];
  const { data: chapters } = await supabase.from("chapters").select("id, name, subject_id").in("id", chapterIds);
  const subjectIds = [...new Set((chapters ?? []).map((c) => c.subject_id))];
  const { data: subjects } = await supabase.from("subjects").select("id, name").in("id", subjectIds);

  const chapterMap = new Map((chapters ?? []).map((c) => [c.id, c]));
  const subjectMap = new Map((subjects ?? []).map((s) => [s.id, s]));

  return (topics ?? []).map((t) => {
    const accs = topicAccuracies.get(t.id) ?? [];
    const chapter = chapterMap.get(t.chapter_id);
    const subject = chapter ? subjectMap.get(chapter.subject_id) : undefined;
    return {
      topicId: t.id,
      topicName: t.name,
      chapterName: chapter?.name ?? "Unknown",
      subjectName: subject?.name ?? "Unknown",
      averageAccuracy: Math.round(accs.reduce((a, b) => a + b, 0) / accs.length),
      totalAttempts: accs.length,
    };
  }).sort((a, b) => a.averageAccuracy - b.averageAccuracy);
}

async function computeNextAction(userId: string): Promise<{
  nextAction: string | null;
  nextActionTarget: string | null;
}> {
  const { data: subjects } = await supabase.from("subjects").select("id").order("order");
  for (const s of subjects ?? []) {
    const { data: chapters } = await supabase.from("chapters").select("id").eq("subject_id", s.id).order("order");
    for (const ch of chapters ?? []) {
      const { data: topics } = await supabase.from("topics").select("id, name").eq("chapter_id", ch.id).order("order");
      for (const t of topics ?? []) {
        const { data: prog } = await supabase.from("topic_progress")
          .select("*")
          .eq("topic_id", t.id)
          .eq("user_id", userId)
          .maybeSingle();
        const target = `/topics/${t.id}`;
        if (!prog || prog.lecture_click_count === 0) {
          return { nextAction: `Watch Lecture: ${t.name}`, nextActionTarget: target };
        }
        if (!prog.lecture_quiz_passed) {
          return { nextAction: `Complete Lecture Quiz: ${t.name}`, nextActionTarget: target };
        }
        if (!prog.dpp_completed) {
          return { nextAction: `Complete DPP: ${t.name}`, nextActionTarget: target };
        }
        if (!prog.pyq_completed) {
          return { nextAction: `Complete PYQs: ${t.name}`, nextActionTarget: target };
        }
        if (!prog.topic_test_passed) {
          return { nextAction: `Take Topic Test: ${t.name}`, nextActionTarget: target };
        }
      }
    }
  }
  return { nextAction: null, nextActionTarget: null };
}

router.get("/dashboard/summary", requireApproved, async (req, res): Promise<void> => {
  const { data: user } = await supabase.from("users").select("*").eq("id", req.user!.id).maybeSingle();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: pomSessions } = await supabase.from("pomodoro_sessions")
    .select("duration_seconds")
    .eq("user_id", req.user!.id)
    .gte("start_time", today.toISOString());
  const todayFocusMinutes = Math.round(
    (pomSessions ?? []).reduce((sum, s) => sum + s.duration_seconds, 0) / 60
  );

  const { data: allSessions } = await supabase.from("pomodoro_sessions")
    .select("start_time")
    .eq("user_id", req.user!.id);
  const uniqueDays = new Set((allSessions ?? []).map((s) => new Date(s.start_time).toDateString()));
  const dayList = Array.from(uniqueDays).sort().reverse();
  let streak = 0;
  const checkDate = new Date(today);
  for (const day of dayList) {
    if (new Date(day).toDateString() === checkDate.toDateString()) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  const { data: subjects } = await supabase.from("subjects").select("id");
  let completedSubjects = 0;
  let totalTopics = 0;
  let completedTopics = 0;

  for (const s of subjects ?? []) {
    const { data: chapters } = await supabase.from("chapters").select("id").eq("subject_id", s.id);
    let subjectComplete = (chapters?.length ?? 0) > 0;
    for (const ch of chapters ?? []) {
      const { data: topics } = await supabase.from("topics").select("id").eq("chapter_id", ch.id);
      totalTopics += topics?.length ?? 0;
      let chapterComplete = (topics?.length ?? 0) > 0;
      for (const t of topics ?? []) {
        const { data: prog } = await supabase.from("topic_progress")
          .select("topic_test_passed")
          .eq("topic_id", t.id)
          .eq("user_id", req.user!.id)
          .maybeSingle();
        if (prog?.topic_test_passed) completedTopics++;
        else chapterComplete = false;
      }
      if (!chapterComplete) subjectComplete = false;
    }
    if (subjectComplete) completedSubjects++;
  }

  const overallProgressPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const { data: recentResults } = await supabase.from("exam_results")
    .select("*")
    .eq("user_id", req.user!.id);

  const recentFormatted = await Promise.all((recentResults ?? []).slice(-5).map(async (r) => {
    const { data: ex } = await supabase.from("exams").select("title, type").eq("id", r.exam_id).maybeSingle();
    return {
      id: r.id, examId: r.exam_id, examTitle: ex?.title ?? "Unknown",
      examType: ex?.type ?? "grand_test",
      score: r.score, maxScore: r.max_score, accuracy: r.accuracy,
      passed: r.passed, submittedAt: r.submitted_at,
    };
  }));

  const today2 = new Date().toISOString().split("T")[0];
  const { data: pendingTasksArr } = await supabase.from("study_tasks")
    .select("id")
    .eq("user_id", req.user!.id)
    .eq("scheduled_date", today2)
    .eq("status", "pending");

  const { nextAction, nextActionTarget } = await computeNextAction(req.user!.id);

  res.json({
    user: formatUser(user),
    focusStreakDays: streak,
    todayFocusMinutes,
    focusGoalMinutes: 120,
    overallProgressPercent,
    completedSubjects,
    totalSubjects: subjects?.length ?? 0,
    nextAction,
    nextActionTarget,
    pendingTasks: pendingTasksArr?.length ?? 0,
    recentResults: recentFormatted,
  });
});

router.get("/dashboard/weak-topics", requireApproved, async (req, res): Promise<void> => {
  const weak = await computeWeakTopics(req.user!.id);
  res.json(weak);
});

router.get("/dashboard/performance-trend", requireApproved, async (req, res): Promise<void> => {
  const [{ data: internalResults }, { data: externalResults }] = await Promise.all([
    supabase.from("exam_results").select("*").eq("user_id", req.user!.id),
    supabase.from("external_tests").select("*").eq("user_id", req.user!.id),
  ]);

  const byDate = new Map<string, { total: number; count: number }>();
  for (const r of internalResults ?? []) {
    const date = new Date(r.submitted_at).toISOString().split("T")[0];
    const existing = byDate.get(date) ?? { total: 0, count: 0 };
    existing.total += r.accuracy;
    existing.count++;
    byDate.set(date, existing);
  }

  const externalByDate = new Map<string, { score: number; maxScore: number; examName: string }>();
  for (const e of externalResults ?? []) {
    const date = new Date(e.attempted_at).toISOString().split("T")[0];
    if (!externalByDate.has(date)) {
      externalByDate.set(date, {
        score: e.score,
        maxScore: e.max_score,
        examName: e.exam_name,
      });
    }
  }

  const allDates = new Set([...byDate.keys(), ...externalByDate.keys()]);
  const trend = Array.from(allDates)
    .map((date) => {
      const internal = byDate.get(date);
      const external = externalByDate.get(date);
      return {
        date,
        averageScore: internal ? Math.round(internal.total / internal.count) : null,
        examCount: internal?.count ?? 0,
        externalScore: external ? Math.round((external.score / external.maxScore) * 100) : null,
        externalExamName: external?.examName ?? null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json(trend);
});

router.get("/progress/summary", requireApproved, async (req, res): Promise<void> => {
  const { data: subjects } = await supabase.from("subjects").select("id");
  let totalSubjects = subjects?.length ?? 0;
  let completedSubjects = 0;
  let totalChapters = 0;
  let completedChapters = 0;
  let totalTopics = 0;
  let completedTopics = 0;

  for (const s of subjects ?? []) {
    const { data: chapters } = await supabase.from("chapters").select("id").eq("subject_id", s.id);
    totalChapters += chapters?.length ?? 0;
    let subjectDone = (chapters?.length ?? 0) > 0;

    for (const ch of chapters ?? []) {
      const { data: topics } = await supabase.from("topics").select("id").eq("chapter_id", ch.id);
      totalTopics += topics?.length ?? 0;
      let chapterDone = (topics?.length ?? 0) > 0;

      for (const t of topics ?? []) {
        const { data: prog } = await supabase.from("topic_progress")
          .select("topic_test_passed")
          .eq("topic_id", t.id)
          .eq("user_id", req.user!.id)
          .maybeSingle();
        if (prog?.topic_test_passed) completedTopics++;
        else chapterDone = false;
      }

      if (chapterDone) completedChapters++;
      else subjectDone = false;
    }

    if (subjectDone) completedSubjects++;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: pomSessions } = await supabase.from("pomodoro_sessions")
    .select("duration_seconds")
    .eq("user_id", req.user!.id)
    .gte("start_time", today.toISOString());
  const totalFocusMinutesToday = Math.round(
    (pomSessions ?? []).reduce((sum, s) => sum + s.duration_seconds, 0) / 60
  );

  const { data: allSessions } = await supabase.from("pomodoro_sessions")
    .select("start_time")
    .eq("user_id", req.user!.id);
  const uniqueDays = new Set((allSessions ?? []).map((s) => new Date(s.start_time).toDateString()));
  const dayList = Array.from(uniqueDays).sort().reverse();
  let focusStreakDays = 0;
  const checkDate = new Date(today);
  for (const day of dayList) {
    if (new Date(day).toDateString() === checkDate.toDateString()) {
      focusStreakDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  const { nextAction, nextActionTarget } = await computeNextAction(req.user!.id);

  res.json({
    totalSubjects, completedSubjects, totalChapters, completedChapters,
    totalTopics, completedTopics,
    overallPercent: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
    focusStreakDays,
    totalFocusMinutesToday,
    nextAction,
    nextActionTarget,
  });
});

router.get("/progress/subject/:subjectId", requireApproved, async (req, res): Promise<void> => {
  const subjectId = String(req.params.subjectId);

  const { data: subject } = await supabase.from("subjects").select("*").eq("id", subjectId).maybeSingle();
  if (!subject) { res.status(404).json({ error: "Subject not found" }); return; }

  const { data: chapters } = await supabase.from("chapters").select("id").eq("subject_id", subjectId);
  let totalTopics = 0;
  let completedTopics = 0;
  const subjectTopicIds = new Set<string>();

  for (const ch of chapters ?? []) {
    const { data: topics } = await supabase.from("topics").select("id").eq("chapter_id", ch.id);
    totalTopics += topics?.length ?? 0;
    for (const t of topics ?? []) {
      subjectTopicIds.add(t.id);
      const { data: prog } = await supabase.from("topic_progress")
        .select("topic_test_passed")
        .eq("topic_id", t.id)
        .eq("user_id", req.user!.id)
        .maybeSingle();
      if (prog?.topic_test_passed) completedTopics++;
    }
  }

  const weakTopicDetails = await computeWeakTopics(req.user!.id, subjectTopicIds);

  res.json({
    subjectId: subject.id,
    subjectName: subject.name,
    progressPercent: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
    completedTopics,
    totalTopics,
    weakTopics: weakTopicDetails.map((w) => w.topicName),
  });
});

router.get("/dashboard/study-heatmap", requireApproved, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const { data: progressRecords } = await supabase.from("topic_progress")
    .select("topic_id, updated_at, created_at, topics(name)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  const activityMap = new Map<string, Set<string>>();

  for (const r of progressRecords ?? []) {
    const topicName = (r.topics as any)?.name ?? "Unknown";
    const updatedDate = new Date(r.updated_at).toISOString().split("T")[0];
    const createdDate = new Date(r.created_at).toISOString().split("T")[0];

    if (!activityMap.has(updatedDate)) activityMap.set(updatedDate, new Set());
    activityMap.get(updatedDate)!.add(topicName);

    if (createdDate !== updatedDate) {
      if (!activityMap.has(createdDate)) activityMap.set(createdDate, new Set());
      activityMap.get(createdDate)!.add(topicName);
    }
  }

  const heatmap = Array.from(activityMap.entries())
    .map(([date, topics]) => ({
      date,
      count: topics.size,
      topics: Array.from(topics),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json(heatmap);
});

export default router;
