import { Router, type IRouter } from "express";
import { db, usersTable, subjectsTable, chaptersTable, topicsTable, questionsTable, examResultsTable, notesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListUsersQueryParams,
  ApproveUserParams,
  SuspendUserParams,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { formatUser } from "./auth";
import { sendApprovalEmail } from "../lib/email";

const router: IRouter = Router();

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

  res.json({ success: true, message: "User suspended" });
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

  await db.update(usersTable)
    .set({ role: parsed.data.role })
    .where(eq(usersTable.id, params.data.userId));

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

  const storageUsedBytes = notes.reduce((sum, n) => sum + n.fileSizeBytes, 0);

  res.json({
    totalUsers: users.length,
    pendingApproval: users.filter((u) => u.status === "pending_approval").length,
    activeUsers: users.filter((u) => u.status === "approved").length,
    totalSubjects: subjects.length,
    totalChapters: chapters.length,
    totalTopics: topics.length,
    totalQuestions: questions.length,
    totalExamsAttempted: results.length,
    storageUsedBytes,
    storageLimitBytes: 10 * 1024 * 1024 * 1024,
  });
});

export default router;
