import { Router, type IRouter } from "express";
import {
  db, usersTable, subjectsTable, chaptersTable, topicsTable,
  topicProgressTable, examResultsTable, examsTable, pomodoroSessionsTable,
  studyTasksTable, externalTestsTable,
} from "@workspace/db";
import { eq, and, gte, inArray, desc } from "drizzle-orm";
import { requireApproved } from "../lib/auth";
import { formatUser } from "./auth";

const router: IRouter = Router();

async function computeWeakTopics(userId: string, filterTopicIds?: Set<string>) {
  const results = await db.select().from(examResultsTable)
    .where(eq(examResultsTable.userId, userId));
  if (results.length === 0) return [];

  const examIds = [...new Set(results.map((r) => r.examId))];
  const exams = await db.select().from(examsTable)
    .where(inArray(examsTable.id, examIds));

  const topicAccuracies = new Map<string, number[]>();
  for (const r of results) {
    const exam = exams.find((e) => e.id === r.examId);
    if (!exam?.topicId) continue;
    if (filterTopicIds && !filterTopicIds.has(exam.topicId)) continue;
    const arr = topicAccuracies.get(exam.topicId) ?? [];
    arr.push(r.accuracy);
    topicAccuracies.set(exam.topicId, arr);
  }

  const weakTopicIds = Array.from(topicAccuracies.entries())
    .filter(([, accs]) => accs.reduce((a, b) => a + b, 0) / accs.length < 50)
    .map(([id]) => id);

  if (weakTopicIds.length === 0) return [];

  const topics = await db.select().from(topicsTable)
    .where(inArray(topicsTable.id, weakTopicIds));
  const chapterIds = [...new Set(topics.map((t) => t.chapterId))];
  const chapters = await db.select().from(chaptersTable)
    .where(inArray(chaptersTable.id, chapterIds));
  const subjectIds = [...new Set(chapters.map((c) => c.subjectId))];
  const subjects = await db.select().from(subjectsTable)
    .where(inArray(subjectsTable.id, subjectIds));

  const chapterMap = new Map(chapters.map((c) => [c.id, c]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  return topics.map((t) => {
    const accs = topicAccuracies.get(t.id) ?? [];
    const chapter = chapterMap.get(t.chapterId);
    const subject = chapter ? subjectMap.get(chapter.subjectId) : undefined;
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
  const subjects = await db.select().from(subjectsTable).orderBy(subjectsTable.order);
  for (const s of subjects) {
    const chapters = await db.select().from(chaptersTable)
      .where(eq(chaptersTable.subjectId, s.id)).orderBy(chaptersTable.order);
    for (const ch of chapters) {
      const topics = await db.select().from(topicsTable)
        .where(eq(topicsTable.chapterId, ch.id)).orderBy(topicsTable.order);
      for (const t of topics) {
        const [prog] = await db.select().from(topicProgressTable)
          .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, userId)));
        const target = `/topics/${t.id}`;
        if (!prog || prog.lectureClickCount === 0) {
          return { nextAction: `Watch Lecture: ${t.name}`, nextActionTarget: target };
        }
        if (!prog.lectureQuizPassed) {
          return { nextAction: `Complete Lecture Quiz: ${t.name}`, nextActionTarget: target };
        }
        if (!prog.dppCompleted) {
          return { nextAction: `Complete DPP: ${t.name}`, nextActionTarget: target };
        }
        if (!prog.pyqCompleted) {
          return { nextAction: `Complete PYQs: ${t.name}`, nextActionTarget: target };
        }
        if (!prog.topicTestPassed) {
          return { nextAction: `Take Topic Test: ${t.name}`, nextActionTarget: target };
        }
      }
    }
  }
  return { nextAction: null, nextActionTarget: null };
}

router.get("/dashboard/summary", requireApproved, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

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

  const { nextAction, nextActionTarget } = await computeNextAction(req.user!.id);

  res.json({
    user: formatUser(user),
    focusStreakDays: streak,
    todayFocusMinutes,
    focusGoalMinutes: 120,
    overallProgressPercent,
    completedSubjects,
    totalSubjects: subjects.length,
    nextAction,
    nextActionTarget,
    pendingTasks: pendingTasksArr.length,
    recentResults: recentFormatted,
  });
});

router.get("/dashboard/weak-topics", requireApproved, async (req, res): Promise<void> => {
  const weak = await computeWeakTopics(req.user!.id);
  res.json(weak);
});

router.get("/dashboard/performance-trend", requireApproved, async (req, res): Promise<void> => {
  const [internalResults, externalResults] = await Promise.all([
    db.select().from(examResultsTable).where(eq(examResultsTable.userId, req.user!.id)),
    db.select().from(externalTestsTable).where(eq(externalTestsTable.userId, req.user!.id)),
  ]);

  const byDate = new Map<string, { total: number; count: number }>();
  for (const r of internalResults) {
    const date = r.submittedAt.toISOString().split("T")[0];
    const existing = byDate.get(date) ?? { total: 0, count: 0 };
    existing.total += r.accuracy;
    existing.count++;
    byDate.set(date, existing);
  }

  const externalByDate = new Map<string, { score: number; maxScore: number; examName: string }>();
  for (const e of externalResults) {
    const date = e.attemptedAt.toISOString().split("T")[0];
    if (!externalByDate.has(date)) {
      externalByDate.set(date, {
        score: e.score,
        maxScore: e.maxScore,
        examName: e.examName,
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pomSessions = await db.select().from(pomodoroSessionsTable)
    .where(and(eq(pomodoroSessionsTable.userId, req.user!.id), gte(pomodoroSessionsTable.startTime, today)));
  const totalFocusMinutesToday = Math.round(
    pomSessions.reduce((sum, s) => sum + s.durationSeconds, 0) / 60
  );

  const allSessions = await db.select().from(pomodoroSessionsTable)
    .where(eq(pomodoroSessionsTable.userId, req.user!.id));
  const uniqueDays = new Set(allSessions.map((s) => s.startTime.toDateString()));
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
  const subjectId = Array.isArray(req.params.subjectId) ? req.params.subjectId[0] : req.params.subjectId;

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, subjectId));
  if (!subject) { res.status(404).json({ error: "Subject not found" }); return; }

  const chapters = await db.select().from(chaptersTable).where(eq(chaptersTable.subjectId, subjectId));
  let totalTopics = 0;
  let completedTopics = 0;
  const subjectTopicIds = new Set<string>();

  for (const ch of chapters) {
    const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, ch.id));
    totalTopics += topics.length;
    for (const t of topics) {
      subjectTopicIds.add(t.id);
      const [prog] = await db.select().from(topicProgressTable)
        .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, req.user!.id)));
      if (prog?.topicTestPassed) completedTopics++;
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

  const progressRecords = await db
    .select({
      topicId: topicProgressTable.topicId,
      topicName: topicsTable.name,
      updatedAt: topicProgressTable.updatedAt,
      createdAt: topicProgressTable.createdAt,
    })
    .from(topicProgressTable)
    .innerJoin(topicsTable, eq(topicsTable.id, topicProgressTable.topicId))
    .where(eq(topicProgressTable.userId, userId))
    .orderBy(desc(topicProgressTable.updatedAt));

  const activityMap = new Map<string, Set<string>>();

  for (const r of progressRecords) {
    const updatedDate = r.updatedAt.toISOString().split("T")[0];
    const createdDate = r.createdAt.toISOString().split("T")[0];

    if (!activityMap.has(updatedDate)) activityMap.set(updatedDate, new Set());
    activityMap.get(updatedDate)!.add(r.topicName);

    if (createdDate !== updatedDate) {
      if (!activityMap.has(createdDate)) activityMap.set(createdDate, new Set());
      activityMap.get(createdDate)!.add(r.topicName);
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
