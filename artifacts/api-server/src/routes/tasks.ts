import { Router, type IRouter } from "express";
import { db, studyTasksTable, topicsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

function formatTask(t: typeof studyTasksTable.$inferSelect, topicName?: string) {
  return {
    id: t.id, userId: t.userId, title: t.title,
    description: t.description ?? null, status: t.status,
    source: t.source, topicId: t.topicId ?? null,
    topicName: topicName ?? null,
    isLocked: t.isLocked === "true",
    sortOrder: t.sortOrder,
    scheduledDate: t.scheduledDate,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/tasks", requireApproved, async (req, res): Promise<void> => {
  const params = ListTasksQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const date = params.data.date ?? today;

  const tasks = await db.select().from(studyTasksTable)
    .where(and(eq(studyTasksTable.userId, req.user!.id), eq(studyTasksTable.scheduledDate, date)));

  const result = await Promise.all(tasks.map(async (t) => {
    let topicName: string | undefined;
    if (t.topicId) {
      const [topic] = await db.select().from(topicsTable).where(eq(topicsTable.id, t.topicId));
      topicName = topic?.name;
    }
    return formatTask(t, topicName);
  }));

  res.json(result);
});

router.post("/tasks", requireApproved, async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const [task] = await db.insert(studyTasksTable).values({
    id: nanoid(),
    userId: req.user!.id,
    title: parsed.data.title,
    description: parsed.data.description,
    topicId: parsed.data.topicId,
    scheduledDate: (parsed.data.scheduledDate as string | undefined) ?? today,
    source: "manual",
    isLocked: "false",
    sortOrder: 0,
  }).returning();

  let topicName: string | undefined;
  if (task.topicId) {
    const [topic] = await db.select().from(topicsTable).where(eq(topicsTable.id, task.topicId));
    topicName = topic?.name;
  }

  res.status(201).json(formatTask(task, topicName));
});

router.patch("/tasks/:taskId", requireApproved, async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status != null) updates.status = parsed.data.status;
  if (parsed.data.sortOrder != null) updates.sortOrder = parsed.data.sortOrder;
  if (parsed.data.title != null) updates.title = parsed.data.title;

  const [task] = await db.update(studyTasksTable)
    .set(updates)
    .where(and(eq(studyTasksTable.id, params.data.taskId), eq(studyTasksTable.userId, req.user!.id)))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(formatTask(task));
});

router.delete("/tasks/:taskId", requireApproved, async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(studyTasksTable)
    .where(and(eq(studyTasksTable.id, params.data.taskId), eq(studyTasksTable.userId, req.user!.id)));
  res.sendStatus(204);
});

export default router;
