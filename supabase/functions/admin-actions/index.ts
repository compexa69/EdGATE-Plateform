import { handleCors, json, err } from "../_shared/cors.ts";
import { requireAuth, adminClient } from "../_shared/auth.ts";

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sendEmailNotification(
  to: string,
  type: string,
  params: Record<string, string>,
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-key": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ type, to, params }),
    });
  } catch (e) {
    console.warn("[admin-actions] email send failed:", e);
  }
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") return err("Method not allowed", 405);

  const actor = await requireAuth(req);
  if (!actor) return err("Unauthorized", 401);

  const isAdmin = ["admin", "super_admin"].includes(actor.role);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { action } = body as { action?: string };
  if (!action) return err("action is required");

  const db = adminClient();

  // ── Broadcast notification (admin only) ──────────────────────────────────
  if (action === "broadcast-notification") {
    if (!isAdmin) return err("Forbidden", 403);

    const { title, message, type = "announcement" } = body as {
      title?: string;
      message?: string;
      type?: string;
    };
    if (!title || !message) return err("title and message are required");

    const { data: users, error: usersErr } = await db
      .from("users")
      .select("id")
      .eq("status", "approved");
    if (usersErr) return err(usersErr.message, 500);

    const notifications = (users ?? []).map((u: { id: string }) => ({
      user_id: u.id,
      type,
      title,
      message,
    }));

    if (notifications.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < notifications.length; i += BATCH) {
        const { error } = await db
          .from("notifications")
          .insert(notifications.slice(i, i + BATCH));
        if (error) return err(error.message, 500);
      }
    }

    return json({ success: true, sent: notifications.length });
  }

  // ── All other actions require a targetUserId ──────────────────────────────
  const { userId: targetUserId } = body as { userId?: string };
  if (!targetUserId) return err("userId is required");

  // ── Approve user ─────────────────────────────────────────────────────────
  if (action === "approve") {
    if (!isAdmin) return err("Forbidden", 403);

    const { data: user, error: fetchErr } = await db
      .from("users")
      .select("email, full_name")
      .eq("id", targetUserId)
      .maybeSingle();
    if (fetchErr) return err(fetchErr.message, 500);
    if (!user) return err("User not found", 404);

    const { error } = await db
      .from("users")
      .update({ status: "approved" })
      .eq("id", targetUserId);
    if (error) return err(error.message, 500);

    await Promise.all([
      db.from("notifications").insert({
        user_id: targetUserId,
        type: "system",
        title: "Account Approved",
        message: "Your account has been approved. Welcome to the platform!",
      }),
      sendEmailNotification(user.email, "approval", { name: user.full_name }),
      db.from("audit_logs").insert({
        actor_id: actor.userId,
        action: "approve_user",
        target_id: targetUserId,
        metadata: { target_email: user.email },
      }).then(() => {}),
    ]);

    return json({ success: true });
  }

  // ── Suspend user ─────────────────────────────────────────────────────────
  if (action === "suspend") {
    if (!isAdmin) return err("Forbidden", 403);

    const { error } = await db
      .from("users")
      .update({ status: "suspended" })
      .eq("id", targetUserId);
    if (error) return err(error.message, 500);

    await Promise.all([
      db.from("notifications").insert({
        user_id: targetUserId,
        type: "system",
        title: "Account Suspended",
        message: "Your account has been suspended. Contact support for more information.",
      }),
      db.from("audit_logs").insert({
        actor_id: actor.userId,
        action: "suspend_user",
        target_id: targetUserId,
        metadata: {},
      }).then(() => {}),
    ]);

    return json({ success: true });
  }

  // ── Ban user ──────────────────────────────────────────────────────────────
  if (action === "ban") {
    if (!isAdmin) return err("Forbidden", 403);

    const { error } = await db
      .from("users")
      .update({ status: "banned" })
      .eq("id", targetUserId);
    if (error) return err(error.message, 500);

    await Promise.all([
      db.from("notifications").insert({
        user_id: targetUserId,
        type: "system",
        title: "Account Banned",
        message: "Your account has been permanently banned.",
      }),
      db.from("audit_logs").insert({
        actor_id: actor.userId,
        action: "ban_user",
        target_id: targetUserId,
        metadata: {},
      }).then(() => {}),
    ]);

    return json({ success: true });
  }

  // ── Update role ───────────────────────────────────────────────────────────
  if (action === "update-role") {
    if (!isAdmin) return err("Forbidden", 403);
    const { role } = body as { role?: string };
    if (!role) return err("role is required");

    const validRoles = ["student", "admin", "super_admin", "content_manager"];
    if (!validRoles.includes(role)) return err(`Invalid role. Must be one of: ${validRoles.join(", ")}`);

    const { error } = await db
      .from("users")
      .update({ role })
      .eq("id", targetUserId);
    if (error) return err(error.message, 500);

    await db.from("audit_logs").insert({
      actor_id: actor.userId,
      action: "update_role",
      target_id: targetUserId,
      metadata: { new_role: role },
    });

    return json({ success: true });
  }

  // ── Reset user progress ───────────────────────────────────────────────────
  if (action === "reset-progress") {
    if (!isAdmin) return err("Forbidden", 403);

    const results = await Promise.all([
      db.from("topic_progress").delete().eq("user_id", targetUserId),
      db.from("exam_attempts").delete().eq("user_id", targetUserId),
      db.from("exam_results").delete().eq("user_id", targetUserId),
      db.from("study_tasks").delete().eq("user_id", targetUserId),
    ]);

    const firstError = results.find((r) => r.error)?.error;
    if (firstError) return err(firstError.message, 500);

    await db.from("notifications").insert({
      user_id: targetUserId,
      type: "system",
      title: "Progress Reset",
      message: "Your study progress has been reset by an administrator.",
    });

    await db.from("audit_logs").insert({
      actor_id: actor.userId,
      action: "reset_progress",
      target_id: targetUserId,
      metadata: {},
    });

    return json({ success: true });
  }

  // ── Force-submit active attempt ───────────────────────────────────────────
  if (action === "force-submit") {
    if (!isAdmin) return err("Forbidden", 403);
    const { attemptId } = body as { attemptId?: string };
    if (!attemptId) return err("attemptId is required");

    const { error } = await db
      .from("exam_attempts")
      .update({ status: "submitted", remaining_seconds: 0 })
      .eq("id", attemptId)
      .eq("user_id", targetUserId);
    if (error) return err(error.message, 500);

    await db.from("audit_logs").insert({
      actor_id: actor.userId,
      action: "force_submit",
      target_id: targetUserId,
      metadata: { attempt_id: attemptId },
    });

    return json({ success: true });
  }

  return err(`Unknown action: ${action}`, 400);
});
