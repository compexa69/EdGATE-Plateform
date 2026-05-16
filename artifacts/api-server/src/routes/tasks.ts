import { Router, type IRouter } from "express";
import {
  db, studyTasksTable, topicsTable, chaptersTable, subjectsTable,
  topicProgressTable, examResultsTable, examsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { requireApproved } from "../lib/auth";

const router: IRouter = Router();

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatTask(t: typeof studyTasksTable.$inferSelect, topicName?: string, chapterName?: string, subjectName?: string) {
  return {
    id: t.id, userId: t.userId, title: t.title,
    description: t.description ?? null, status: t.status,
    source: t.source, topicId: t.topicId ?? null,
    topicName: topicName ?? null,
    chapterName: chapterName ?? null,
    subjectName: subjectName ?? null,
    isLocked: t.isLocked === "true",
    sortOrder: t.sortOrder,
    scheduledDate: t.scheduledDate,
    createdAt: t.createdAt.toISOString(),
  };
}

async function enrichTask(t: typeof studyTasksTable.$inferSelect) {
  if (!t.topicId) return formatTask(t);
  const [topic] = await db.select().from(topicsTable).where(eq(topicsTable.id, t.topicId));
  if (!topic) return formatTask(t);
  const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, topic.chapterId));
  const [subject] = chapter
    ? await db.select().from(subjectsTable).where(eq(subjectsTable.id, chapter.subjectId))
    : [undefined];
  return formatTask(t, topic.name, chapter?.name, subject?.name);
}

// ── GET /tasks ──────────────────────────────────────────────────────────────
router.get("/tasks", requireApproved, async (req, res): Promise<void> => {
  const params = ListTasksQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const date = params.data.date ?? toDateStr(new Date());
  const tasks = await db.select().from(studyTasksTable)
    .where(and(eq(studyTasksTable.userId, req.user!.id), eq(studyTasksTable.scheduledDate, date)))
    .orderBy(studyTasksTable.sortOrder);

  res.json(await Promise.all(tasks.map(enrichTask)));
});

// ── GET /tasks/range ─────────────────────────────────────────────────────────
router.get("/tasks/range", requireApproved, async (req, res): Promise<void> => {
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate and endDate are required" });
    return;
  }
  const tasks = await db.select().from(studyTasksTable)
    .where(and(
      eq(studyTasksTable.userId, req.user!.id),
      gte(studyTasksTable.scheduledDate, startDate),
      lte(studyTasksTable.scheduledDate, endDate),
    ))
    .orderBy(studyTasksTable.scheduledDate, studyTasksTable.sortOrder);

  res.json(await Promise.all(tasks.map(enrichTask)));
});

// ── POST /tasks/generate-plan ─────────────────────────────────────────────
router.post("/tasks/generate-plan", requireApproved, async (req, res): Promise<void> => {
  const { examDate, dailyStudyHours = 4, targetScore = 70 } = req.body as {
    examDate: string;
    dailyStudyHours?: number;
    targetScore?: number;
  };

  if (!examDate || isNaN(Date.parse(examDate))) {
    res.status(400).json({ error: "Valid examDate (YYYY-MM-DD) is required" });
    return;
  }

  const userId = req.user!.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);
  const daysUntilExam = Math.floor((exam.getTime() - today.getTime()) / 86_400_000);

  if (daysUntilExam < 1) {
    res.status(400).json({ error: "examDate must be at least tomorrow" });
    return;
  }

  // ── 1. Load full curriculum ──────────────────────────────────────────────
  const subjects = await db.select().from(subjectsTable).orderBy(subjectsTable.order);
  type TopicRow = {
    id: string; name: string; order: number; chapterId: string;
    chapterName: string; subjectName: string; globalIndex: number;
  };
  const allTopics: TopicRow[] = [];
  let globalIndex = 0;

  for (const s of subjects) {
    const chapters = await db.select().from(chaptersTable)
      .where(eq(chaptersTable.subjectId, s.id)).orderBy(chaptersTable.order);
    for (const ch of chapters) {
      const topics = await db.select().from(topicsTable)
        .where(eq(topicsTable.chapterId, ch.id)).orderBy(topicsTable.order);
      for (const t of topics) {
        allTopics.push({
          id: t.id, name: t.name, order: t.order, chapterId: ch.id,
          chapterName: ch.name, subjectName: s.name, globalIndex: globalIndex++,
        });
      }
    }
  }

  if (allTopics.length === 0) {
    res.status(400).json({ error: "No topics found in the curriculum" });
    return;
  }

  // ── 2. Load user progress ────────────────────────────────────────────────
  const progress = await db.select().from(topicProgressTable)
    .where(eq(topicProgressTable.userId, userId));
  const progressMap = new Map(progress.map((p) => [p.topicId, p]));

  // ── 3. Load exam results to identify weak topics ─────────────────────────
  const results = await db.select().from(examResultsTable)
    .where(eq(examResultsTable.userId, userId));
  const examIds = [...new Set(results.map((r) => r.examId))];
  const exams = examIds.length > 0
    ? await db.select().from(examsTable).where(inArray(examsTable.id, examIds))
    : [];
  const examByTopicAccuracy = new Map<string, number[]>();
  for (const r of results) {
    const exam = exams.find((e) => e.id === r.examId);
    if (exam?.topicId) {
      const arr = examByTopicAccuracy.get(exam.topicId) ?? [];
      arr.push(r.accuracy);
      examByTopicAccuracy.set(exam.topicId, arr);
    }
  }

  // ── 4. Score every topic (higher = more urgent) ──────────────────────────
  type ScoredTopic = TopicRow & { priority: number; tag: string };
  const scored: ScoredTopic[] = allTopics.map((t) => {
    const prog = progressMap.get(t.id);
    const accuracies = examByTopicAccuracy.get(t.id) ?? [];
    const avgAcc = accuracies.length ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : null;

    let priority = 50;
    let tag = "unstarted";

    if (!prog) {
      priority = 60; tag = "unstarted";
    } else if (prog.topicTestPassed) {
      // Completed — only include if target score is high (needs revision)
      priority = targetScore >= 85 ? 25 : 5;
      tag = targetScore >= 85 ? "revision" : "completed";
    } else if (avgAcc !== null && avgAcc < 55) {
      priority = 90; tag = "weak";
    } else if (prog.lectureQuizPassed && !prog.dppCompleted) {
      priority = 75; tag = "in-progress";
    } else if (!prog.lectureQuizPassed) {
      priority = 65; tag = "unstarted";
    } else {
      priority = 55; tag = "in-progress";
    }

    // Extra boost for weak topics regardless of target
    if (avgAcc !== null && avgAcc < 40) priority = Math.max(priority, 95);

    return { ...t, priority, tag };
  });

  // ── 5. Separate weak (for revision block) from general study ─────────────
  const weakTopics = scored.filter((t) => t.tag === "weak" || (t.tag === "revision" && t.priority > 20));
  const studyTopics = scored
    .filter((t) => t.tag !== "completed" || targetScore >= 85)
    .sort((a, b) => b.priority - a.priority || a.globalIndex - b.globalIndex);

  // ── 6. Calculate slot counts ─────────────────────────────────────────────
  const topicsPerDay = Math.max(1, Math.floor(dailyStudyHours / 1.5));
  const revisionDays = daysUntilExam > 14 ? Math.min(7, Math.ceil(daysUntilExam * 0.2)) : 0;
  const studyDays = daysUntilExam - revisionDays;

  // ── 7. Build day-by-day schedule ─────────────────────────────────────────
  type DayPlan = { date: string; tasks: ScoredTopic[] };
  const plan: DayPlan[] = [];
  let topicIdx = 0;

  for (let day = 0; day < studyDays && topicIdx < studyTopics.length; day++) {
    const date = toDateStr(addDays(today, day + 1));
    const dayTopics = studyTopics.slice(topicIdx, topicIdx + topicsPerDay);
    topicIdx += topicsPerDay;
    if (dayTopics.length > 0) plan.push({ date, tasks: dayTopics });
  }

  // ── 8. Revision block in the final days ──────────────────────────────────
  const revWeakTopics = weakTopics.length > 0 ? weakTopics : studyTopics.slice(0, topicsPerDay * revisionDays);
  let revIdx = 0;
  for (let day = 0; day < revisionDays && revIdx < revWeakTopics.length; day++) {
    const date = toDateStr(addDays(today, studyDays + day + 1));
    const dayTopics = revWeakTopics.slice(revIdx, revIdx + topicsPerDay);
    revIdx += topicsPerDay;
    if (dayTopics.length > 0) plan.push({ date, tasks: dayTopics });
  }

  // ── 9. Wipe existing auto-generated tasks from today onwards ─────────────
  const existingAuto = await db.select().from(studyTasksTable)
    .where(and(
      eq(studyTasksTable.userId, userId),
      eq(studyTasksTable.source, "auto"),
      gte(studyTasksTable.scheduledDate, toDateStr(addDays(today, 1))),
    ));
  if (existingAuto.length > 0) {
    await db.delete(studyTasksTable).where(
      inArray(studyTasksTable.id, existingAuto.map((t) => t.id)),
    );
  }

  // ── 10. Bulk insert new tasks ─────────────────────────────────────────────
  let tasksCreated = 0;
  for (const day of plan) {
    for (let i = 0; i < day.tasks.length; i++) {
      const t = day.tasks[i];
      const isRevision = t.tag === "weak" || t.tag === "revision";
      const title = isRevision
        ? `[Revision] ${t.subjectName} — ${t.name}`
        : `${t.subjectName} — ${t.name}`;
      const description = isRevision
        ? `Revise ${t.chapterName} › ${t.name}. Focus on accuracy improvements.`
        : `Study ${t.chapterName} › ${t.name}. Complete lecture → quiz → DPP → PYQ → test.`;

      await db.insert(studyTasksTable).values({
        id: nanoid(),
        userId,
        title,
        description,
        topicId: t.id,
        scheduledDate: day.date,
        source: "auto",
        isLocked: "false",
        sortOrder: i,
      });
      tasksCreated++;
    }
  }

  const topicsCovered = new Set(plan.flatMap((d) => d.tasks.map((t) => t.id))).size;
  const totalTopics = allTopics.length;
  const completedTopics = progress.filter((p) => p.topicTestPassed).length;

  res.json({
    tasksCreated,
    daysPlanned: plan.length,
    topicsCovered,
    totalTopics,
    completedTopics,
    weakTopicsFound: weakTopics.length,
    examDate,
    daysUntilExam,
    revisionDays,
    firstTaskDate: plan[0]?.date ?? null,
    lastTaskDate: plan[plan.length - 1]?.date ?? null,
  });
});

// ── POST /tasks ───────────────────────────────────────────────────────────
router.post("/tasks", requireApproved, async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const today = toDateStr(new Date());
  const [task] = await db.insert(studyTasksTable).values({
    id: nanoid(), userId: req.user!.id,
    title: parsed.data.title,
    description: parsed.data.description,
    topicId: parsed.data.topicId,
    scheduledDate: (parsed.data.scheduledDate as string | undefined) ?? today,
    source: "manual", isLocked: "false", sortOrder: 0,
  }).returning();

  res.status(201).json(await enrichTask(task));
});

// ── PATCH /tasks/:taskId ──────────────────────────────────────────────────
router.patch("/tasks/:taskId", requireApproved, async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status != null) updates.status = parsed.data.status;
  if (parsed.data.sortOrder != null) updates.sortOrder = parsed.data.sortOrder;
  if (parsed.data.title != null) updates.title = parsed.data.title;

  const [task] = await db.update(studyTasksTable)
    .set(updates)
    .where(and(eq(studyTasksTable.id, params.data.taskId), eq(studyTasksTable.userId, req.user!.id)))
    .returning();

  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(await enrichTask(task));
});

// ── DELETE /tasks/:taskId ─────────────────────────────────────────────────
router.delete("/tasks/:taskId", requireApproved, async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(studyTasksTable)
    .where(and(eq(studyTasksTable.id, params.data.taskId), eq(studyTasksTable.userId, req.user!.id)));
  res.sendStatus(204);
});

export default router;
