import { Router, type IRouter } from "express";
import { db, usersTable, subjectsTable, chaptersTable, topicsTable, topicProgressTable, examResultsTable, examsTable, pomodoroSessionsTable, studyTasksTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { requireApproved } from "../lib/auth";
import { formatUser } from "./auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireApproved, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pomSessions = await db.select().from(pomodoroSessionsTable)
    .where(and(eq(pomodoroSessionsTable.userId, req.user!.id), gte(pomodoroSessionsTable.startTime, today)));
  const todayFocusMinutes = Math.round(
    pomSessions.reduce((sum, s) => sum + s.durationSeconds, 0) / 60
  );

  const allSessions = await db.select().from(pomodoroSessionsTable)
    .where(eq(pomodoroSessionsTable.userId, req.user!.id));
  const uniqueDays = new Set(allSessions.map((s) => s.startTime.toDateString()));
  const dayList = Array.from(uniqueDays).sort().reverse();
  let streak = 0;
  const checkDate = new Date(today);
  for (const day of dayList) {
    if (new Date(day).toDateString() === checkDate.toDateString()) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  const subjects = await db.select().from(subjectsTable);
  let completedSubjects = 0;
  let totalTopics = 0;
  let completedTopics = 0;

  for (const s of subjects) {
    const chapters = await db.select().from(chaptersTable).where(eq(chaptersTable.subjectId, s.id));
    let subjectComplete = chapters.length > 0;
    for (const ch of chapters) {
      const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, ch.id));
      totalTopics += topics.length;
      let chapterComplete = topics.length > 0;
      for (const t of topics) {
        const [prog] = await db.select().from(topicProgressTable)
          .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, req.user!.id)));
        if (prog?.topicTestPassed) completedTopics++;
        else chapterComplete = false;
      }
      if (!chapterComplete) subjectComplete = false;
    }
    if (subjectComplete) completedSubjects++;
  }

  const overallProgressPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const recentResults = await db.select().from(examResultsTable)
    .where(eq(examResultsTable.userId, req.user!.id));

  const recentFormatted = await Promise.all(recentResults.slice(-5).map(async (r) => {
    const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, r.examId));
    return {
      id: r.id, examId: r.examId, examTitle: exam?.title ?? "Unknown",
      examType: exam?.type ?? "grand_test",
      score: r.score, maxScore: r.maxScore, accuracy: r.accuracy,
      passed: r.passed, submittedAt: r.submittedAt.toISOString(),
    };
  }));

  const today2 = new Date().toISOString().split("T")[0];
  const pendingTasksArr = await db.select().from(studyTasksTable)
    .where(and(
      eq(studyTasksTable.userId, req.user!.id),
      eq(studyTasksTable.scheduledDate, today2),
      eq(studyTasksTable.status, "pending")
    ));

  res.json({
    user: formatUser(user),
    focusStreakDays: streak,
    todayFocusMinutes,
    focusGoalMinutes: 120,
    overallProgressPercent,
    completedSubjects,
    totalSubjects: subjects.length,
    nextAction: null,
    nextActionTarget: null,
    pendingTasks: pendingTasksArr.length,
    recentResults: recentFormatted,
  });
});

router.get("/dashboard/weak-topics", requireApproved, async (req, res): Promise<void> => {
  res.json([]);
});

router.get("/dashboard/performance-trend", requireApproved, async (req, res): Promise<void> => {
  const results = await db.select().from(examResultsTable)
    .where(eq(examResultsTable.userId, req.user!.id));

  const byDate = new Map<string, { total: number; count: number }>();
  for (const r of results) {
    const date = r.submittedAt.toISOString().split("T")[0];
    const existing = byDate.get(date) ?? { total: 0, count: 0 };
    existing.total += r.accuracy;
    existing.count++;
    byDate.set(date, existing);
  }

  const trend = Array.from(byDate.entries())
    .map(([date, { total, count }]) => ({
      date,
      averageScore: Math.round(total / count),
      examCount: count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json(trend);
});

router.get("/progress/summary", requireApproved, async (req, res): Promise<void> => {
  const subjects = await db.select().from(subjectsTable);
  let totalSubjects = subjects.length;
  let completedSubjects = 0;
  let totalChapters = 0;
  let completedChapters = 0;
  let totalTopics = 0;
  let completedTopics = 0;

  for (const s of subjects) {
    const chapters = await db.select().from(chaptersTable).where(eq(chaptersTable.subjectId, s.id));
    totalChapters += chapters.length;
    let subjectDone = chapters.length > 0;

    for (const ch of chapters) {
      const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, ch.id));
      totalTopics += topics.length;
      let chapterDone = topics.length > 0;

      for (const t of topics) {
        const [prog] = await db.select().from(topicProgressTable)
          .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, req.user!.id)));
        if (prog?.topicTestPassed) completedTopics++;
        else chapterDone = false;
      }

      if (chapterDone) completedChapters++;
      else subjectDone = false;
    }

    if (subjectDone) completedSubjects++;
  }

  res.json({
    totalSubjects, completedSubjects, totalChapters, completedChapters,
    totalTopics, completedTopics,
    overallPercent: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
    focusStreakDays: 0, totalFocusMinutesToday: 0,
    nextAction: null, nextActionTarget: null,
  });
});

router.get("/progress/subject/:subjectId", requireApproved, async (req, res): Promise<void> => {
  const subjectId = Array.isArray(req.params.subjectId) ? req.params.subjectId[0] : req.params.subjectId;

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, subjectId));
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const chapters = await db.select().from(chaptersTable).where(eq(chaptersTable.subjectId, subjectId));
  let totalTopics = 0;
  let completedTopics = 0;

  for (const ch of chapters) {
    const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, ch.id));
    totalTopics += topics.length;
    for (const t of topics) {
      const [prog] = await db.select().from(topicProgressTable)
        .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, req.user!.id)));
      if (prog?.topicTestPassed) completedTopics++;
    }
  }

  res.json({
    subjectId: subject.id,
    subjectName: subject.name,
    progressPercent: totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0,
    completedTopics,
    totalTopics,
    weakTopics: [],
  });
});

export default router;
