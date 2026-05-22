import { Router, type IRouter } from "express";
import { timingSafeEqual } from "crypto";
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
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

const DEFAULT_CONFIG: Record<string, { value: string; description: string }> = {
  lecture_quiz_passing_score: { value: "60", description: "Minimum % to pass a Lecture Quiz" },
  topic_test_passing_score: { value: "60", description: "Minimum % to pass a Topic Test" },
  chapter_test_passing_score: { value: "60", description: "Minimum % to pass a Chapter Test" },
  max_quiz_attempts: { value: "3", description: "Max attempts allowed per quiz before cooldown" },
  max_exam_pauses: { value: "2", description: "Max pauses allowed per exam attempt" },
  low_ctr_threshold: { value: "10", description: "CTR % below which a topic lecture is flagged" },
};

async function ensureDefaultConfig() {
  for (const [key, { value, description }] of Object.entries(DEFAULT_CONFIG)) {
    await supabase.from("system_config").upsert({ key, value, description }, { onConflict: "key", ignoreDuplicates: true });
  }
}

async function logAudit(actorId: string, targetId: string | null, action: string, details?: string) {
  await supabase.from("audit_logs").insert({
    id: nanoid(),
    actor_id: actorId,
    target_id: targetId,
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

  let query = supabase.from("users").select("*");
  if (params.data.status) {
    query = query.eq("status", params.data.status);
  }
  const { data: users } = await query;

  res.json((users ?? []).map((u) => ({
    id: u.id, fullName: u.full_name, email: u.email, mobile: u.mobile,
    role: u.role, status: u.status, emailVerified: u.email_verified,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at ?? null,
  })));
});

router.post("/admin/users/:userId/approve", requireAdmin, async (req, res): Promise<void> => {
  const params = ApproveUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data: user } = await supabase.from("users")
    .update({ status: "approved" })
    .eq("id", params.data.userId)
    .select()
    .maybeSingle();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await sendApprovalEmail(user.email, user.full_name);

  await createNotification(
    user.id,
    "user_approved",
    "Account Approved!",
    `Welcome, ${user.full_name}! Your account has been approved. You can now start your study journey.`,
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

  const { data: user } = await supabase.from("users")
    .update({ status: "suspended" })
    .eq("id", params.data.userId)
    .select()
    .maybeSingle();

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

  const { data: user } = await supabase.from("users").select("*").eq("id", params.data.userId).maybeSingle();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === "super_admin") {
    res.status(403).json({ error: "Cannot ban a super_admin account." });
    return;
  }

  const { data: updated } = await supabase.from("users")
    .update({ status: "banned" })
    .eq("id", params.data.userId)
    .select()
    .single();

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
    const { count } = await supabase.from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "super_admin");
    if ((count ?? 0) <= 1) {
      res.status(403).json({ error: "Cannot demote the sole super_admin. Promote another user first." });
      return;
    }
  }

  await supabase.from("users")
    .update({ role: parsed.data.role })
    .eq("id", params.data.userId);

  await logAudit(
    req.user!.id,
    params.data.userId,
    "update_role",
    `Changed role to ${parsed.data.role}`,
  );

  res.json({ success: true, message: "Role updated" });
});

router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
  const [
    { data: users },
    { data: subjects },
    { data: chapters },
    { data: topics },
    { data: questions },
    { data: results },
    { data: notes },
    { data: allProgress },
  ] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("subjects").select("*"),
    supabase.from("chapters").select("*"),
    supabase.from("topics").select("id, name"),
    supabase.from("questions").select("id"),
    supabase.from("exam_results").select("*"),
    supabase.from("notes").select("file_size_bytes"),
    supabase.from("topic_progress").select("*"),
  ]);

  const storageUsedBytes = (notes ?? []).reduce((sum, n) => sum + n.file_size_bytes, 0);

  const lectureClicksByTopic: Record<string, number> = {};
  for (const p of allProgress ?? []) {
    if (p.lecture_click_count > 0) {
      lectureClicksByTopic[p.topic_id] = (lectureClicksByTopic[p.topic_id] ?? 0) + p.lecture_click_count;
    }
  }

  const totalApprovedUsers = (users ?? []).filter((u) => u.status === "approved").length;

  const { data: lowCtrConfigRow } = await supabase.from("system_config")
    .select("value")
    .eq("key", "low_ctr_threshold")
    .maybeSingle();
  const lowCtrThreshold = lowCtrConfigRow ? parseInt(lowCtrConfigRow.value, 10) : 10;

  const topicsWithCtr = (topics ?? []).map((t) => {
    const totalClicks = lectureClicksByTopic[t.id] ?? 0;
    const uniqueClickers = (allProgress ?? []).filter(
      (p) => p.topic_id === t.id && p.lecture_click_count > 0,
    ).length;
    const ctrPercent = totalApprovedUsers > 0
      ? Math.round((uniqueClickers / totalApprovedUsers) * 100)
      : 0;
    return { topicId: t.id, topicName: t.name, totalClicks, uniqueClickers, ctrPercent };
  });

  const lowCtrTopics = topicsWithCtr
    .filter((t) => t.ctrPercent < lowCtrThreshold)
    .sort((a, b) => a.ctrPercent - b.ctrPercent)
    .slice(0, 10);

  const totalLectureClicks = Object.values(lectureClicksByTopic).reduce((s, c) => s + c, 0);

  res.json({
    totalUsers: users?.length ?? 0,
    pendingApproval: (users ?? []).filter((u) => u.status === "pending_approval").length,
    activeUsers: totalApprovedUsers,
    totalSubjects: subjects?.length ?? 0,
    totalChapters: chapters?.length ?? 0,
    totalTopics: topics?.length ?? 0,
    totalQuestions: questions?.length ?? 0,
    totalExamsAttempted: results?.length ?? 0,
    storageUsedBytes,
    storageLimitBytes: 9 * 1024 * 1024 * 1024,
    totalLectureClicks,
    lowCtrTopics,
  });
});

router.get("/admin/config", requireAdmin, async (req, res): Promise<void> => {
  await ensureDefaultConfig();
  const { data: configs } = await supabase.from("system_config").select("*");
  const configMap = Object.fromEntries((configs ?? []).map((c) => [c.key, { value: c.value, description: c.description ?? "" }]));
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
    await supabase.from("system_config").upsert({ key, value }, { onConflict: "key" });
  }

  await logAudit(req.user!.id, null, "update_config", `Updated keys: ${Object.keys(updates).join(", ")}`);

  res.json({ success: true });
});

router.get("/admin/audit-logs", requireAdmin, async (req, res): Promise<void> => {
  const { data: logs } = await supabase.from("audit_logs")
    .select("*, users!audit_logs_actor_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  res.json((logs ?? []).map((l) => ({
    id: l.id,
    actorId: l.actor_id,
    actorName: (l.users as any)?.full_name ?? "System",
    targetId: l.target_id,
    action: l.action,
    details: l.details,
    createdAt: l.created_at,
  })));
});

router.post("/admin/users/:userId/reset-progress", requireAdmin, async (req, res): Promise<void> => {
  const actor = req.user!;
  if (actor.role !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can reset user progress." });
    return;
  }

  const { userId } = req.params as { userId: string };

  const { data: target } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await supabase.from("topic_progress").delete().eq("user_id", userId);

  const { data: userAttempts } = await supabase.from("exam_attempts").select("id").eq("user_id", userId);
  for (const attempt of userAttempts ?? []) {
    await supabase.from("attempt_answers").delete().eq("attempt_id", attempt.id);
  }
  await supabase.from("exam_attempts").delete().eq("user_id", userId);
  await supabase.from("exam_results").delete().eq("user_id", userId);

  await logAudit(actor.id, userId, "reset_progress", `Reset all progress for user ${target.email}`);

  res.json({ success: true, message: `Progress reset for ${target.full_name}` });
});

router.get("/admin/export-data", requireAdmin, async (req, res): Promise<void> => {
  const actor = req.user!;
  if (actor.role !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can export user data." });
    return;
  }

  const [
    { data: users },
    { data: results },
    { data: notes },
    { data: progress },
  ] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("exam_results").select("*"),
    supabase.from("notes").select("*"),
    supabase.from("topic_progress").select("*"),
  ]);

  const sanitizedUsers = (users ?? []).map((u) => ({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    mobile: u.mobile,
    role: u.role,
    status: u.status,
    emailVerified: u.email_verified,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at ?? null,
  }));

  await logAudit(actor.id, null, "export_data", "Exported all user data (GDPR)");

  res.json({
    exportedAt: new Date().toISOString(),
    users: sanitizedUsers,
    examResults: (results ?? []).map((r) => ({
      id: r.id, userId: r.user_id, examId: r.exam_id, score: r.score,
      maxScore: r.max_score, accuracy: r.accuracy, passed: r.passed,
      submittedAt: r.submitted_at,
    })),
    notes: (notes ?? []).map((n) => ({
      id: n.id, userId: n.user_id, chapterId: n.chapter_id,
      fileName: n.file_name, fileSizeBytes: n.file_size_bytes,
      uploadedAt: n.uploaded_at,
    })),
    topicProgress: (progress ?? []).map((p) => ({
      id: p.id, userId: p.user_id, topicId: p.topic_id,
      lectureQuizPassed: p.lecture_quiz_passed, dppCompleted: p.dpp_completed,
      pyqCompleted: p.pyq_completed, topicTestPassed: p.topic_test_passed,
      updatedAt: p.updated_at ?? null,
    })),
  });
});

router.get("/admin/qr-analytics", requireAdmin, async (req, res): Promise<void> => {
  const { data: allScans } = await supabase.from("qr_scan_logs").select("question_id, user_id");

  const scanCounts: Record<string, number> = {};
  const uniqueStudents = new Set<string>();
  for (const s of allScans ?? []) {
    scanCounts[s.question_id] = (scanCounts[s.question_id] ?? 0) + 1;
    uniqueStudents.add(s.user_id);
  }

  const topQuestions = Object.entries(scanCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([questionId, scanCount]) => ({ questionId, scanCount }));

  const { data: recentScansRaw } = await supabase.from("qr_scan_logs")
    .select("*, users!qr_scan_logs_user_id_fkey(full_name)")
    .order("scanned_at", { ascending: false })
    .limit(30);

  res.json({
    totalScans: allScans?.length ?? 0,
    uniqueStudents: uniqueStudents.size,
    topQuestions,
    recentScans: (recentScansRaw ?? []).map((s) => ({
      id: s.id,
      questionId: s.question_id,
      userId: s.user_id,
      examId: s.exam_id,
      scannedAt: s.scanned_at,
      userName: (s.users as any)?.full_name ?? "Unknown",
    })),
  });
});

router.get("/admin/live-attempts", requireAdmin, async (req, res): Promise<void> => {
  const { data: liveAttempts } = await supabase.from("exam_attempts")
    .select("*, users!exam_attempts_user_id_fkey(full_name), exams!exam_attempts_exam_id_fkey(title, type)")
    .eq("status", "in_progress")
    .order("start_time", { ascending: false });

  res.json((liveAttempts ?? []).map((a) => ({
    id: a.id,
    userId: a.user_id,
    examId: a.exam_id,
    status: a.status,
    startTime: a.start_time,
    remainingSeconds: a.remaining_seconds,
    pauseCount: a.pause_count,
    userName: (a.users as any)?.full_name ?? null,
    examTitle: (a.exams as any)?.title ?? null,
    examType: (a.exams as any)?.type ?? null,
    elapsedMinutes: Math.floor((Date.now() - new Date(a.start_time).getTime()) / 60000),
  })));
});

router.post("/admin/attempts/:attemptId/force-submit", requireAdmin, async (req, res): Promise<void> => {
  const attemptId = String(req.params.attemptId);
  if (!attemptId) { res.status(400).json({ error: "attemptId is required" }); return; }

  const { data: attempt } = await supabase.from("exam_attempts").select("*").eq("id", attemptId).maybeSingle();
  if (!attempt) { res.status(404).json({ error: "Attempt not found" }); return; }
  if (attempt.status === "submitted") {
    res.status(409).json({ error: "Attempt is already submitted" });
    return;
  }

  await supabase.from("exam_attempts")
    .update({ status: "submitted", end_time: new Date().toISOString(), remaining_seconds: 0 })
    .eq("id", attemptId);

  await createNotification(
    attempt.user_id,
    "exam_reminder",
    "Exam Submitted by Admin",
    "An administrator has submitted your in-progress exam attempt on your behalf.",
  );

  res.json({ success: true, attemptId, message: "Attempt force-submitted successfully" });
});

router.post("/admin/import-syllabus", requireAdmin, async (req, res): Promise<void> => {
  const { rows } = req.body as { rows?: Array<{ subject_name: string; chapter_name: string; topic_name: string; topic_order?: number }> };

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "rows array is required" });
    return;
  }

  const created = { subjects: 0, chapters: 0, topics: 0 };
  const subjectCache: Record<string, string> = {};
  const chapterCache: Record<string, string> = {};

  for (const row of rows) {
    const subjectName = row.subject_name?.trim();
    const chapterName = row.chapter_name?.trim();
    const topicName = row.topic_name?.trim();

    if (!subjectName || !chapterName || !topicName) continue;

    if (!subjectCache[subjectName]) {
      const { data: existing } = await supabase.from("subjects").select("id").eq("name", subjectName).maybeSingle();
      if (existing) {
        subjectCache[subjectName] = existing.id;
      } else {
        const { count } = await supabase.from("subjects").select("*", { count: "exact", head: true });
        const { data: newSubject } = await supabase.from("subjects").insert({
          id: nanoid(),
          name: subjectName,
          order: (count ?? 0) + 1,
        }).select().single();
        subjectCache[subjectName] = newSubject.id;
        created.subjects++;
      }
    }

    const subjectId = subjectCache[subjectName];
    const chapterKey = `${subjectId}::${chapterName}`;

    if (!chapterCache[chapterKey]) {
      const { data: existing } = await supabase.from("chapters")
        .select("id")
        .eq("subject_id", subjectId)
        .eq("name", chapterName)
        .maybeSingle();
      if (existing) {
        chapterCache[chapterKey] = existing.id;
      } else {
        const { count } = await supabase.from("chapters")
          .select("*", { count: "exact", head: true })
          .eq("subject_id", subjectId);
        const { data: newChapter } = await supabase.from("chapters").insert({
          id: nanoid(),
          subject_id: subjectId,
          name: chapterName,
          order: (count ?? 0) + 1,
        }).select().single();
        chapterCache[chapterKey] = newChapter.id;
        created.chapters++;
      }
    }

    const chapterId = chapterCache[chapterKey];

    const { data: existingTopic } = await supabase.from("topics")
      .select("id")
      .eq("chapter_id", chapterId)
      .eq("name", topicName)
      .maybeSingle();
    if (!existingTopic) {
      const { count } = await supabase.from("topics")
        .select("*", { count: "exact", head: true })
        .eq("chapter_id", chapterId);
      await supabase.from("topics").insert({
        id: nanoid(),
        chapter_id: chapterId,
        name: topicName,
        order: row.topic_order ?? (count ?? 0) + 1,
      });
      created.topics++;
    }
  }

  await logAudit(req.user!.id, null, "import_syllabus", `Imported ${created.subjects} subjects, ${created.chapters} chapters, ${created.topics} topics`);

  res.json({ success: true, created });
});

router.post("/admin/emergency-recovery", async (req, res): Promise<void> => {
  const recoverySecret = process.env.RECOVERY_SECRET;
  if (!recoverySecret) {
    res.status(503).json({ error: "Emergency recovery is not configured on this server." });
    return;
  }
  const { userId, secret } = req.body as { userId?: string; secret?: string };
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required." });
    return;
  }
  if (!secret || typeof secret !== "string") {
    res.status(400).json({ error: "secret is required." });
    return;
  }
  let valid = false;
  try {
    valid =
      secret.length === recoverySecret.length &&
      timingSafeEqual(Buffer.from(secret, "utf8"), Buffer.from(recoverySecret, "utf8"));
  } catch {
    valid = false;
  }
  if (!valid) {
    res.status(403).json({ error: "Invalid recovery secret." });
    return;
  }
  const { data: updated } = await supabase.from("users")
    .update({ role: "super_admin", status: "approved" })
    .eq("id", userId)
    .select("id, email")
    .maybeSingle();
  if (!updated) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json({ success: true, message: `User ${updated.email} has been promoted to super_admin.` });
});

export default router;
