import { Router, type IRouter } from "express";
import { db, usersTable, subjectsTable, chaptersTable, topicsTable, questionsTable, examResultsTable, examAttemptsTable, attemptAnswersTable, notesTable, topicProgressTable, systemConfigTable, auditLogsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ListUsersQueryParams,
  ApproveUserParams,
  SuspendUserParams,
  BanUserParams,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { sendApprovalEmail } from "../lib/email";
import { createNotification } from "./notifications";

const router: IRouter = Router();

const DEFAULT_CONFIG: Record<string, { value: string; description: string }> = {
  lecture_quiz_passing_score: { value: "60", description: "Minimum % to pass a Lecture Quiz" },
  topic_test_passing_score: { value: "60", description: "Minimum % to pass a Topic Test" },
  chapter_test_passing_score: { value: "60", description: "Minimum % to pass a Chapter Test" },
  max_quiz_attempts: { value: "3", description: "Max attempts allowed per quiz before cooldown" },
  low_ctr_threshold: { value: "10", description: "CTR % below which a topic lecture is flagged" },
};

async function ensureDefaultConfig() {
  for (const [key, { value, description }] of Object.entries(DEFAULT_CONFIG)) {
    await db.insert(systemConfigTable)
      .values({ key, value, description })
      .onConflictDoNothing();
  }
}

async function logAudit(actorId: string, targetId: string | null, action: string, details?: string) {
  await db.insert(auditLogsTable).values({
    id: nanoid(),
    actorId,
    targetId,
    action,
    details: details ?? null,
  });
}

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const params = ListUsersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let users = await db.select().from(usersTable);
  if (params.data.status) {
    users = users.filter((u) => u.status === params.data.status);
  }

  res.json(users.map((u) => ({
    id: u.id, fullName: u.fullName, email: u.email, mobile: u.mobile,
    role: u.role, status: u.status, emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  })));
});

router.post("/admin/users/:userId/approve", requireAdmin, async (req, res): Promise<void> => {
  const params = ApproveUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.update(usersTable)
    .set({ status: "approved" })
    .where(eq(usersTable.id, params.data.userId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await sendApprovalEmail(user.email, user.fullName);

  await createNotification(
    user.id,
    "user_approved",
    "Account Approved!",
    `Welcome, ${user.fullName}! Your account has been approved. You can now start your study journey.`,
  );

  await logAudit(req.user!.id, user.id, "approve_user", `Approved user ${user.email}`);

  res.json({ success: true, message: "User approved" });
});

router.post("/admin/users/:userId/suspend", requireAdmin, async (req, res): Promise<void> => {
  const params = SuspendUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.update(usersTable)
    .set({ status: "suspended" })
    .where(eq(usersTable.id, params.data.userId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await logAudit(req.user!.id, user.id, "suspend_user", `Suspended user ${user.email}`);

  res.json({ success: true, message: "User suspended" });
});

router.post("/admin/users/:userId/ban", requireAdmin, async (req, res): Promise<void> => {
  const params = BanUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === "super_admin") {
    res.status(403).json({ error: "Cannot ban a super_admin account." });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ status: "banned" })
    .where(eq(usersTable.id, params.data.userId))
    .returning();

  await logAudit(req.user!.id, updated.id, "ban_user", `Permanently banned user ${updated.email}`);

  res.json({ success: true, message: "User banned" });
});

router.patch("/admin/users/:userId/role", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (params.data.userId === req.user!.id && (parsed.data.role as string) !== "super_admin") {
    const allSuperAdmins = await db.select().from(usersTable)
      .where(eq(usersTable.role, "super_admin"));
    if (allSuperAdmins.length <= 1) {
      res.status(403).json({ error: "Cannot demote the sole super_admin. Promote another user first." });
      return;
    }
  }

  const [user] = await db.update(usersTable)
    .set({ role: parsed.data.role })
    .where(eq(usersTable.id, params.data.userId))
    .returning();

  await logAudit(
    req.user!.id,
    params.data.userId,
    "update_role",
    `Changed role to ${parsed.data.role}`,
  );

  res.json({ success: true, message: "Role updated" });
});

router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable);
  const subjects = await db.select().from(subjectsTable);
  const chapters = await db.select().from(chaptersTable);
  const topics = await db.select().from(topicsTable);
  const questions = await db.select().from(questionsTable);
  const results = await db.select().from(examResultsTable);
  const notes = await db.select().from(notesTable);

  const allProgress = await db.select().from(topicProgressTable);

  const storageUsedBytes = notes.reduce((sum, n) => sum + n.fileSizeBytes, 0);

  const lectureClicksByTopic: Record<string, number> = {};
  for (const p of allProgress) {
    if (p.lectureClickCount > 0) {
      lectureClicksByTopic[p.topicId] = (lectureClicksByTopic[p.topicId] ?? 0) + p.lectureClickCount;
    }
  }

  const totalApprovedUsers = users.filter((u) => u.status === "approved").length;

  const topicsWithCtr = topics.map((t) => {
    const totalClicks = lectureClicksByTopic[t.id] ?? 0;
    const uniqueClickers = allProgress.filter(
      (p) => p.topicId === t.id && p.lectureClickCount > 0,
    ).length;
    const ctrPercent = totalApprovedUsers > 0
      ? Math.round((uniqueClickers / totalApprovedUsers) * 100)
      : 0;
    return { topicId: t.id, topicName: t.name, totalClicks, uniqueClickers, ctrPercent };
  });

  const lowCtrTopics = topicsWithCtr
    .filter((t) => t.ctrPercent < 10)
    .sort((a, b) => a.ctrPercent - b.ctrPercent)
    .slice(0, 10);

  const totalLectureClicks = Object.values(lectureClicksByTopic).reduce((s, c) => s + c, 0);

  res.json({
    totalUsers: users.length,
    pendingApproval: users.filter((u) => u.status === "pending_approval").length,
    activeUsers: totalApprovedUsers,
    totalSubjects: subjects.length,
    totalChapters: chapters.length,
    totalTopics: topics.length,
    totalQuestions: questions.length,
    totalExamsAttempted: results.length,
    storageUsedBytes,
    storageLimitBytes: 9 * 1024 * 1024 * 1024,
    totalLectureClicks,
    lowCtrTopics,
  });
});

router.get("/admin/config", requireAdmin, async (req, res): Promise<void> => {
  await ensureDefaultConfig();
  const configs = await db.select().from(systemConfigTable);
  const configMap = Object.fromEntries(configs.map((c) => [c.key, { value: c.value, description: c.description ?? "" }]));
  res.json(configMap);
});

router.patch("/admin/config", requireAdmin, async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Body must be an object of key-value pairs" });
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value !== "string") continue;
    await db.insert(systemConfigTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: systemConfigTable.key, set: { value } });
  }

  await logAudit(req.user!.id, null, "update_config", `Updated keys: ${Object.keys(updates).join(", ")}`);

  res.json({ success: true });
});

router.get("/admin/audit-logs", requireAdmin, async (req, res): Promise<void> => {
  const logs = await db.select({
    id: auditLogsTable.id,
    actorId: auditLogsTable.actorId,
    targetId: auditLogsTable.targetId,
    action: auditLogsTable.action,
    details: auditLogsTable.details,
    createdAt: auditLogsTable.createdAt,
    actorName: usersTable.fullName,
  })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.actorId, usersTable.id))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(100);

  res.json(logs.map((l) => ({
    id: l.id,
    actorId: l.actorId,
    actorName: l.actorName ?? "System",
    targetId: l.targetId,
    action: l.action,
    details: l.details,
    createdAt: l.createdAt.toISOString(),
  })));
});

router.post("/admin/users/:userId/reset-progress", requireAdmin, async (req, res): Promise<void> => {
  const actor = req.user!;
  if (actor.role !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can reset user progress." });
    return;
  }

  const { userId } = req.params as { userId: string };

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.delete(topicProgressTable).where(eq(topicProgressTable.userId, userId));

  const userAttempts = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.userId, userId));
  for (const attempt of userAttempts) {
    await db.delete(attemptAnswersTable).where(eq(attemptAnswersTable.attemptId, attempt.id));
  }
  await db.delete(examAttemptsTable).where(eq(examAttemptsTable.userId, userId));
  await db.delete(examResultsTable).where(eq(examResultsTable.userId, userId));

  await logAudit(actor.id, userId, "reset_progress", `Reset all progress for user ${target.email}`);

  res.json({ success: true, message: `Progress reset for ${target.fullName}` });
});

router.get("/admin/export-data", requireAdmin, async (req, res): Promise<void> => {
  const actor = req.user!;
  if (actor.role !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can export user data." });
    return;
  }

  const users = await db.select().from(usersTable);
  const results = await db.select().from(examResultsTable);
  const notes = await db.select().from(notesTable);
  const progress = await db.select().from(topicProgressTable);

  const sanitizedUsers = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    mobile: u.mobile,
    role: u.role,
    status: u.status,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));

  await logAudit(actor.id, null, "export_data", "Exported all user data (GDPR)");

  res.json({
    exportedAt: new Date().toISOString(),
    users: sanitizedUsers,
    examResults: results.map((r) => ({
      ...r,
      submittedAt: r.submittedAt.toISOString(),
    })),
    notes: notes.map((n) => ({
      ...n,
      uploadedAt: n.uploadedAt.toISOString(),
    })),
    topicProgress: progress.map((p) => ({
      ...p,
      updatedAt: p.updatedAt?.toISOString() ?? null,
    })),
  });
});

export default router;
