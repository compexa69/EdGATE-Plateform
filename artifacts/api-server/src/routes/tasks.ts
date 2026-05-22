import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { requireApproved } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatTask(t: Record<string, any>, topicName?: string, chapterName?: string, subjectName?: string) {
  return {
    id: t.id, userId: t.user_id, title: t.title,
    description: t.description ?? null, status: t.status,
    source: t.source, topicId: t.topic_id ?? null,
    topicName: topicName ?? null,
    chapterName: chapterName ?? null,
    subjectName: subjectName ?? null,
    isLocked: t.is_locked === "true",
    sortOrder: t.sort_order,
    scheduledDate: t.scheduled_date,
    createdAt: t.created_at,
  };
}

async function enrichTask(t: Record<string, any>) {
  if (!t.topic_id) return formatTask(t);
  const { data: topic } = await supabase.from("topics").select("*, chapters(*, subjects(*))").eq("id", t.topic_id).maybeSingle();
  if (!topic) return formatTask(t);
  const chapter = (topic as any).chapters;
  const subject = chapter?.subjects;
  return formatTask(t, topic.name, chapter?.name, subject?.name);
}

router.get("/tasks", requireApproved, async (req, res): Promise<void> => {
  const params = ListTasksQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const date = params.data.date ?? toDateStr(new Date());
  const { data: tasks } = await supabase.from("study_tasks")
    .select("*")
    .eq("user_id", req.user!.id)
    .eq("scheduled_date", date)
    .order("sort_order");

  res.json(await Promise.all((tasks ?? []).map(enrichTask)));
});

router.get("/tasks/range", requireApproved, async (req, res): Promise<void> => {
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate and endDate are required" });
    return;
  }
  const { data: tasks } = await supabase.from("study_tasks")
    .select("*")
    .eq("user_id", req.user!.id)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .order("scheduled_date")
    .order("sort_order");

  res.json(await Promise.all((tasks ?? []).map(enrichTask)));
});

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

  const { data: subjects } = await supabase.from("subjects").select("id, name").order("order");

  type TopicRow = {
    id: string; name: string; order: number; chapterId: string;
    chapterName: string; subjectName: string; globalIndex: number;
  };
  const allTopics: TopicRow[] = [];
  let globalIndex = 0;

  for (const s of subjects ?? []) {
    const { data: chapters } = await supabase.from("chapters").select("id, name").eq("subject_id", s.id).order("order");
    for (const ch of chapters ?? []) {
      const { data: topics } = await supabase.from("topics").select("id, name, order").eq("chapter_id", ch.id).order("order");
      for (const t of topics ?? []) {
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

  const { data: progress } = await supabase.from("topic_progress").select("*").eq("user_id", userId);
  const progressMap = new Map((progress ?? []).map((p) => [p.topic_id, p]));

  const { data: results } = await supabase.from("exam_results").select("*").eq("user_id", userId);
  const examIds = [...new Set((results ?? []).map((r) => r.exam_id))];
  const exams = examIds.length > 0
    ? (await supabase.from("exams").select("id, topic_id").in("id", examIds)).data ?? []
    : [];
  const examByTopicAccuracy = new Map<string, number[]>();
  for (const r of results ?? []) {
    const e = exams.find((ex) => ex.id === r.exam_id);
    if (e?.topic_id) {
      const arr = examByTopicAccuracy.get(e.topic_id) ?? [];
      arr.push(r.accuracy);
      examByTopicAccuracy.set(e.topic_id, arr);
    }
  }

  type ScoredTopic = TopicRow & { priority: number; tag: string };
  const scored: ScoredTopic[] = allTopics.map((t) => {
    const prog = progressMap.get(t.id);
    const accuracies = examByTopicAccuracy.get(t.id) ?? [];
    const avgAcc = accuracies.length ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : null;

    let priority = 50;
    let tag = "unstarted";

    if (!prog) {
      priority = 60; tag = "unstarted";
    } else if (prog.topic_test_passed) {
      priority = targetScore >= 85 ? 25 : 5;
      tag = targetScore >= 85 ? "revision" : "completed";
    } else if (avgAcc !== null && avgAcc < 55) {
      priority = 90; tag = "weak";
    } else if (prog.lecture_quiz_passed && !prog.dpp_completed) {
      priority = 75; tag = "in-progress";
    } else if (!prog.lecture_quiz_passed) {
      priority = 65; tag = "unstarted";
    } else {
      priority = 55; tag = "in-progress";
    }

    if (avgAcc !== null && avgAcc < 40) priority = Math.max(priority, 95);

    return { ...t, priority, tag };
  });

  const weakTopics = scored.filter((t) => t.tag === "weak" || (t.tag === "revision" && t.priority > 20));
  const studyTopics = scored
    .filter((t) => t.tag !== "completed" || targetScore >= 85)
    .sort((a, b) => b.priority - a.priority || a.globalIndex - b.globalIndex);

  const topicsPerDay = Math.max(1, Math.floor(dailyStudyHours / 1.5));
  const revisionDays = daysUntilExam > 14 ? Math.min(7, Math.ceil(daysUntilExam * 0.2)) : 0;
  const studyDays = daysUntilExam - revisionDays;

  type DayPlan = { date: string; tasks: ScoredTopic[] };
  const plan: DayPlan[] = [];
  let topicIdx = 0;

  for (let day = 0; day < studyDays && topicIdx < studyTopics.length; day++) {
    const date = toDateStr(addDays(today, day + 1));
    const dayTopics = studyTopics.slice(topicIdx, topicIdx + topicsPerDay);
    topicIdx += topicsPerDay;
    if (dayTopics.length > 0) plan.push({ date, tasks: dayTopics });
  }

  const revWeakTopics = weakTopics.length > 0 ? weakTopics : studyTopics.slice(0, topicsPerDay * revisionDays);
  let revIdx = 0;
  for (let day = 0; day < revisionDays && revIdx < revWeakTopics.length; day++) {
    const date = toDateStr(addDays(today, studyDays + day + 1));
    const dayTopics = revWeakTopics.slice(revIdx, revIdx + topicsPerDay);
    revIdx += topicsPerDay;
    if (dayTopics.length > 0) plan.push({ date, tasks: dayTopics });
  }

  const { data: existingAuto } = await supabase.from("study_tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "auto")
    .gte("scheduled_date", toDateStr(addDays(today, 1)));

  if (existingAuto && existingAuto.length > 0) {
    await supabase.from("study_tasks").delete().in("id", existingAuto.map((t) => t.id));
  }

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

      await supabase.from("study_tasks").insert({
        id: nanoid(),
        user_id: userId,
        title,
        description,
        topic_id: t.id,
        scheduled_date: day.date,
        source: "auto",
        is_locked: "false",
        sort_order: i,
      });
      tasksCreated++;
    }
  }

  const topicsCovered = new Set(plan.flatMap((d) => d.tasks.map((t) => t.id))).size;
  const totalTopics = allTopics.length;
  const completedTopics = (progress ?? []).filter((p) => p.topic_test_passed).length;

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

router.post("/tasks", requireApproved, async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const today = toDateStr(new Date());
  const { data: task } = await supabase.from("study_tasks").insert({
    id: nanoid(), user_id: req.user!.id,
    title: parsed.data.title,
    description: (parsed.data as any).description,
    topic_id: (parsed.data as any).topicId,
    scheduled_date: (parsed.data as any).scheduledDate ?? today,
    source: "manual", is_locked: "false", sort_order: 0,
  }).select().single();

  res.status(201).json(await enrichTask(task));
});

router.patch("/tasks/:taskId", requireApproved, async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status != null) updates.status = parsed.data.status;
  if (parsed.data.sortOrder != null) updates.sort_order = parsed.data.sortOrder;
  if (parsed.data.title != null) updates.title = parsed.data.title;

  const { data: task } = await supabase.from("study_tasks")
    .update(updates)
    .eq("id", params.data.taskId)
    .eq("user_id", req.user!.id)
    .select()
    .maybeSingle();

  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  res.json(await enrichTask(task));
});

router.delete("/tasks/:taskId", requireApproved, async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await supabase.from("study_tasks")
    .delete()
    .eq("id", params.data.taskId)
    .eq("user_id", req.user!.id);
  res.sendStatus(204);
});

export default router;
