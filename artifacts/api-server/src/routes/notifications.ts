import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import { requireApproved, requireAdmin } from "../lib/auth";
import { supabase } from "../lib/supabase";
import webPush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@edtech-platform.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const router: IRouter = Router();

type PushSubscriptionPayload = {
  endpoint: string;
  keys?: { auth?: string; p256dh?: string };
  expirationTime?: number | null;
};

router.post("/notifications/subscribe", requireApproved, async (req, res): Promise<void> => {
  const { subscription } = req.body as { subscription?: PushSubscriptionPayload };
  if (!subscription || !subscription.endpoint) {
    res.status(400).json({ error: "subscription object with endpoint is required" });
    return;
  }

  await supabase.from("push_subscriptions").upsert({
    id: nanoid(),
    user_id: req.user!.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys?.p256dh ?? null,
    auth: subscription.keys?.auth ?? null,
  }, { onConflict: "endpoint" });

  res.json({ success: true, message: "Push subscription registered" });
});

router.delete("/notifications/subscribe", requireApproved, async (req, res): Promise<void> => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }

  await supabase.from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", req.user!.id);

  res.json({ success: true, message: "Push subscription removed" });
});

router.get("/notifications", requireApproved, async (req, res): Promise<void> => {
  const { data: notifications } = await supabase.from("notifications")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("created_at", { ascending: false })
    .limit(50);

  res.json((notifications ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.is_read,
    createdAt: n.created_at,
  })));
});

router.patch("/notifications/:notificationId/read", requireApproved, async (req, res): Promise<void> => {
  const notificationId = String(req.params.notificationId);
  await supabase.from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", req.user!.id);

  res.json({ success: true });
});

router.post("/notifications/read-all", requireApproved, async (req, res): Promise<void> => {
  await supabase.from("notifications")
    .update({ is_read: true })
    .eq("user_id", req.user!.id);

  res.json({ success: true });
});

router.post("/admin/notifications/broadcast", requireAdmin, async (req, res): Promise<void> => {
  const { title, message } = req.body as { title: string; message: string };
  if (!title || !message) {
    res.status(400).json({ error: "title and message are required" });
    return;
  }

  const { data: users } = await supabase.from("users").select("id").eq("status", "approved");

  if (users && users.length > 0) {
    await supabase.from("notifications").insert(
      users.map((u) => ({
        id: nanoid(),
        user_id: u.id,
        type: "system",
        title,
        message,
        is_read: false,
      }))
    );
  }

  res.json({ success: true, sent: users?.length ?? 0 });
});

router.get("/notifications/vapid-public-key", requireApproved, (_req, res): void => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
): Promise<void> {
  await supabase.from("notifications").insert({
    id: nanoid(),
    user_id: userId,
    type,
    title,
    message,
    is_read: false,
  });
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    sendPushNotification(userId, title, message).catch(() => {});
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url = "/",
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("user_id", userId);

  const payload = JSON.stringify({ title, body, url, tag: `edtech-${Date.now()}` });

  await Promise.allSettled(
    (subs ?? []).map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh ?? "",
              auth: sub.auth ?? "",
            },
          },
          payload,
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }),
  );
}

export default router;
