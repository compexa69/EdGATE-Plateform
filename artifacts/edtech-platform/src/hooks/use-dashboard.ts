import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface DashboardSummary {
  streakDays: number;
  xpPoints: number;
  totalFocusMinutes: number;
  topicsCompleted: number;
  totalTopics: number;
  examsAttempted: number;
  examsPassed: number;
  avgAccuracy: number;
}

export interface WeakTopic {
  topicId: string;
  topicName: string;
  subjectName: string;
  accuracy: number;
  attempts: number;
}

export interface PerformanceTrendEntry {
  date: string;
  score: number;
  accuracy: number;
  examTitle: string;
}

export interface HeatmapEntry {
  date: string;
  count: number;
}

export function useGetDashboardSummary() {
  const { user } = useAuth();
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const [
        { data: topicProgress },
        { data: totalTopicsData },
        { data: results },
        { data: pomodoro },
      ] = await Promise.all([
        supabase.from("topic_progress").select("topic_test_passed, created_at, updated_at").eq("user_id", user!.id),
        supabase.from("topics").select("id", { count: "exact", head: false }),
        supabase.from("exam_results").select("passed, accuracy, submitted_at").eq("user_id", user!.id),
        supabase.from("pomodoro_sessions").select("duration_minutes, completed_at").eq("user_id", user!.id).gte("completed_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);

      const topicsCompleted = (topicProgress ?? []).filter((p) => p.topic_test_passed).length;
      const totalTopics = totalTopicsData?.length ?? 0;

      const passedResults = (results ?? []).filter((r) => r.passed).length;
      const avgAccuracy = results && results.length > 0
        ? Math.round(results.reduce((s, r) => s + r.accuracy, 0) / results.length)
        : 0;

      const totalFocusMinutes = (pomodoro ?? []).reduce((s, p) => s + (p.focus_minutes ?? 0), 0);

      const streak = computeStreak(results ?? []);
      const xpPoints = topicsCompleted * 10 + passedResults * 20 + Math.floor(totalFocusMinutes / 30) * 5;

      return {
        streakDays: streak,
        xpPoints,
        totalFocusMinutes,
        topicsCompleted,
        totalTopics,
        examsAttempted: results?.length ?? 0,
        examsPassed: passedResults,
        avgAccuracy,
      };
    },
  });
}

function computeStreak(results: Array<{ submitted_at: string }>): number {
  if (results.length === 0) return 0;
  const dates = [...new Set(results.map((r) => r.submitted_at.split("T")[0]))].sort().reverse();
  let streak = 0;
  let current = new Date();
  current.setHours(0, 0, 0, 0);

  for (const dateStr of dates) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((current.getTime() - d.getTime()) / 86400000);
    if (diff === streak) { streak++; current = d; }
    else break;
  }
  return streak;
}

export function useGetWeakTopics() {
  const { user } = useAuth();
  return useQuery<WeakTopic[]>({
    queryKey: ["weak-topics", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: results } = await supabase
        .from("exam_results")
        .select("exam_id, accuracy")
        .eq("user_id", user!.id)
        .lt("accuracy", 60);

      if (!results || results.length === 0) return [];

      const examIds = [...new Set(results.map((r) => r.exam_id))];
      const { data: exams } = await supabase.from("exams").select("id, topic_id").in("id", examIds).not("topic_id", "is", null);

      const topicAccuracy = new Map<string, { total: number; count: number }>();
      for (const r of results) {
        const exam = exams?.find((e) => e.id === r.exam_id);
        if (!exam?.topic_id) continue;
        const existing = topicAccuracy.get(exam.topic_id) ?? { total: 0, count: 0 };
        topicAccuracy.set(exam.topic_id, { total: existing.total + r.accuracy, count: existing.count + 1 });
      }

      if (topicAccuracy.size === 0) return [];

      const topicIds = [...topicAccuracy.keys()];
      const { data: topics } = await supabase.from("topics").select("id, name, chapter_id").in("id", topicIds);
      const chapterIds = [...new Set((topics ?? []).map((t) => t.chapter_id))];
      const { data: chapters } = await supabase.from("chapters").select("id, subject_id").in("id", chapterIds);
      const subjectIds = [...new Set((chapters ?? []).map((c) => c.subject_id))];
      const { data: subjects } = await supabase.from("subjects").select("id, name").in("id", subjectIds);

      const chapterMap = new Map((chapters ?? []).map((c) => [c.id, c]));
      const subjectMap = new Map((subjects ?? []).map((s) => [s.id, s]));

      return (topics ?? []).map((t) => {
        const acc = topicAccuracy.get(t.id)!;
        const ch = chapterMap.get(t.chapter_id);
        const sub = ch ? subjectMap.get(ch.subject_id) : null;
        return {
          topicId: t.id,
          topicName: t.name,
          subjectName: sub?.name ?? "Unknown",
          accuracy: Math.round(acc.total / acc.count),
          attempts: acc.count,
        };
      }).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
    },
  });
}

export function useGetPerformanceTrend() {
  const { user } = useAuth();
  return useQuery<PerformanceTrendEntry[]>({
    queryKey: ["performance-trend", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: results } = await supabase
        .from("exam_results")
        .select("exam_id, score, max_score, accuracy, submitted_at")
        .eq("user_id", user!.id)
        .order("submitted_at", { ascending: false })
        .limit(15);

      if (!results || results.length === 0) return [];

      const examIds = [...new Set(results.map((r) => r.exam_id))];
      const { data: exams } = await supabase.from("exams").select("id, title").in("id", examIds);
      const examMap = new Map((exams ?? []).map((e) => [e.id, e]));

      return results.reverse().map((r) => ({
        date: new Date(r.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        score: r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0,
        accuracy: Math.round(r.accuracy),
        examTitle: examMap.get(r.exam_id)?.title ?? "Exam",
      }));
    },
  });
}

export function useGetStudyHeatmap() {
  const { user } = useAuth();
  return useQuery<HeatmapEntry[]>({
    queryKey: ["study-heatmap", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const [{ data: results }, { data: tasks }] = await Promise.all([
        supabase.from("exam_results").select("submitted_at").eq("user_id", user!.id).gte("submitted_at", since),
        supabase.from("study_tasks").select("scheduled_date").eq("user_id", user!.id).eq("status", "completed").gte("scheduled_date", since.split("T")[0]),
      ]);

      const counts = new Map<string, number>();
      for (const r of results ?? []) {
        const d = r.submitted_at.split("T")[0];
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      for (const t of tasks ?? []) {
        const d = t.scheduled_date;
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }

      return [...counts.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

export function useGetProgressSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["progress-summary", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: subjects }, { data: chapters }, { data: topics }, { data: progress }] = await Promise.all([
        supabase.from("subjects").select("id, name").order("order"),
        supabase.from("chapters").select("id, subject_id").order("order"),
        supabase.from("topics").select("id, chapter_id"),
        supabase.from("topic_progress").select("topic_id, topic_test_passed").eq("user_id", user!.id),
      ]);

      const progressMap = new Map((progress ?? []).map((p) => [p.topic_id, p]));
      const topicsByChapter = new Map<string, string[]>();
      for (const t of topics ?? []) {
        if (!topicsByChapter.has(t.chapter_id)) topicsByChapter.set(t.chapter_id, []);
        topicsByChapter.get(t.chapter_id)!.push(t.id);
      }

      return (subjects ?? []).map((subject) => {
        const subChapters = (chapters ?? []).filter((c) => c.subject_id === subject.id);
        let completed = 0;
        let total = 0;
        for (const ch of subChapters) {
          const chTopics = topicsByChapter.get(ch.id) ?? [];
          total += chTopics.length;
          completed += chTopics.filter((id) => progressMap.get(id)?.topic_test_passed).length;
        }
        return {
          subjectId: subject.id,
          subjectName: subject.name,
          completedTopics: completed,
          totalTopics: total,
          progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      });
    },
  });
}

export function useGetTodayTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["today-tasks", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("study_tasks")
        .select("id, title, status, source, topic_id, scheduled_date")
        .eq("user_id", user!.id)
        .eq("scheduled_date", today)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGetAdminStats() {
  return useQuery({
    queryKey: ["admin-stats"],
    staleTime: 30_000,
    queryFn: async () => {
      const [
        { count: totalUsers },
        { count: pendingUsers },
        { count: totalSubjects },
        { count: totalTopics },
        { count: totalQuestions },
        { count: totalExams },
        { count: totalAttempts },
        { data: recentAttempts },
        { data: weakTopics },
      ] = await Promise.all([
        supabase.from("users").select("*", { count: "exact", head: true }),
        supabase.from("users").select("*", { count: "exact", head: true }).eq("status", "pending_approval"),
        supabase.from("subjects").select("*", { count: "exact", head: true }),
        supabase.from("topics").select("*", { count: "exact", head: true }),
        supabase.from("questions").select("*", { count: "exact", head: true }),
        supabase.from("exams").select("*", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("*", { count: "exact", head: true }),
        supabase.from("exam_attempts").select("id, user_id, exam_id, status, start_time, remaining_seconds, pause_count").in("status", ["in_progress", "paused"]).order("start_time", { ascending: false }).limit(10),
        supabase.from("exam_results").select("exam_id, accuracy").lt("accuracy", 50).limit(100),
      ]);

      const totalStorageBytes = 0;

      const liveAttempts = await Promise.all((recentAttempts ?? []).map(async (a) => {
        const [{ data: user }, { data: exam }] = await Promise.all([
          supabase.from("users").select("full_name").eq("id", a.user_id).single(),
          supabase.from("exams").select("title, type").eq("id", a.exam_id).single(),
        ]);
        const elapsed = Math.floor((Date.now() - new Date(a.start_time).getTime()) / 60000);
        return {
          id: a.id,
          userId: a.user_id,
          examId: a.exam_id,
          status: a.status,
          startTime: a.start_time,
          remainingSeconds: a.remaining_seconds,
          pauseCount: a.pause_count,
          userName: user?.full_name ?? null,
          examTitle: exam?.title ?? null,
          examType: exam?.type ?? null,
          elapsedMinutes: elapsed,
        };
      }));

      return {
        totalUsers: totalUsers ?? 0,
        pendingUsers: pendingUsers ?? 0,
        totalSubjects: totalSubjects ?? 0,
        totalTopics: totalTopics ?? 0,
        totalQuestions: totalQuestions ?? 0,
        totalExams: totalExams ?? 0,
        totalAttempts: totalAttempts ?? 0,
        totalStorageBytes,
        liveAttempts,
        lowCtrTopics: [],
      };
    },
  });
}

export function useGetQrAnalytics() {
  return useQuery({
    queryKey: ["qr-analytics"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: scans } = await supabase
        .from("qr_scan_logs")
        .select("id, question_id, user_id, scanned_at, exam_id")
        .order("scanned_at", { ascending: false })
        .limit(100);

      const userIds = [...new Set((scans ?? []).map((s) => s.user_id))];
      const { data: users } = userIds.length > 0
        ? await supabase.from("users").select("id, full_name").in("id", userIds)
        : { data: [] };
      const userMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));

      const questionCounts = new Map<string, number>();
      for (const s of scans ?? []) {
        questionCounts.set(s.question_id, (questionCounts.get(s.question_id) ?? 0) + 1);
      }

      const topQuestions = [...questionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([questionId, scanCount]) => ({ questionId, scanCount }));

      return {
        totalScans: scans?.length ?? 0,
        uniqueStudents: userIds.length,
        topQuestions,
        recentScans: (scans ?? []).slice(0, 20).map((s) => ({
          id: s.id,
          questionId: s.question_id,
          userId: s.user_id,
          userName: userMap.get(s.user_id) ?? null,
          scannedAt: s.scanned_at,
          examId: s.exam_id,
        })),
      };
    },
  });
}

export function useGetLiveAttempts() {
  return useQuery({
    queryKey: ["live-attempts"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("id, user_id, exam_id, status, start_time, remaining_seconds, pause_count")
        .in("status", ["in_progress", "paused"])
        .order("start_time", { ascending: false });

      if (!attempts || attempts.length === 0) return [];

      const userIds = [...new Set(attempts.map((a) => a.user_id))];
      const examIds = [...new Set(attempts.map((a) => a.exam_id))];

      const [{ data: users }, { data: exams }] = await Promise.all([
        supabase.from("users").select("id, full_name").in("id", userIds),
        supabase.from("exams").select("id, title, type").in("id", examIds),
      ]);

      const userMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      const examMap = new Map((exams ?? []).map((e) => [e.id, e]));

      return attempts.map((a) => ({
        id: a.id,
        userId: a.user_id,
        examId: a.exam_id,
        status: a.status,
        startTime: a.start_time,
        remainingSeconds: a.remaining_seconds,
        pauseCount: a.pause_count,
        userName: userMap.get(a.user_id) ?? null,
        examTitle: examMap.get(a.exam_id)?.title ?? null,
        examType: examMap.get(a.exam_id)?.type ?? null,
        elapsedMinutes: Math.floor((Date.now() - new Date(a.start_time).getTime()) / 60000),
      }));
    },
  });
}
