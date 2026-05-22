import { Router, type IRouter } from "express";
import { db, notificationsTable, usersTable, pushSubscriptionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireApproved, requireAdmin } from "../lib/auth";
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

  await db.insert(pushSubscriptionsTable)
    .values({
      id: nanoid(),
      userId: req.user!.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh ?? null,
      auth: subscription.keys?.auth ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        userId: req.user!.id,
        p256dh: subscription.keys?.p256dh ?? null,
        auth: subscription.keys?.auth ?? null,
      },
    });

  res.json({ success: true, message: "Push subscription registered" });
});

router.delete("/notifications/subscribe", requireApproved, async (req, res): Promise<void> => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }

  await db.delete(pushSubscriptionsTable)
    .where(and(
      eq(pushSubscriptionsTable.endpoint, endpoint),
      eq(pushSubscriptionsTable.userId, req.user!.id),
    ));

  res.json({ success: true, message: "Push subscription removed" });
});

router.get("/notifications", requireApproved, async (req, res): Promise<void> => {
  const notifications = await db.select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.user!.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  })));
});

router.patch("/notifications/:notificationId/read", requireApproved, async (req, res): Promise<void> => {
  const notificationId = String(req.params.notificationId);
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(
      eq(notificationsTable.id, notificationId),
      eq(notificationsTable.userId, req.user!.id),
    ));

  res.json({ success: true });
});

router.post("/notifications/read-all", requireApproved, async (req, res): Promise<void> => {
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.user!.id));

  res.json({ success: true });
});

router.post("/admin/notifications/broadcast", requireAdmin, async (req, res): Promise<void> => {
  const { title, message } = req.body as { title: string; message: string };
  if (!title || !message) {
    res.status(400).json({ error: "title and message are required" });
    return;
  }

  const users = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.status, "approved"));

  if (users.length > 0) {
    await db.insert(notificationsTable).values(
      users.map((u) => ({
        id: nanoid(),
        userId: u.id,
        type: "system",
        title,
        message,
        isRead: false,
      }))
    );
  }

  res.json({ success: true, sent: users.length });
});

// GET /api/notifications/vapid-public-key — returns VAPID public key for client push subscription
router.get("/notifications/vapid-public-key", requireApproved, (_req, res): void => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
): Promise<void> {
  await db.insert(notificationsTable).values({
    id: nanoid(),
    userId,
    type,
    title,
    message,
    isRead: false,
  });
  // Fire-and-forget web push delivery
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

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  const payload = JSON.stringify({ title, body, url, tag: `edtech-${Date.now()}` });

  await Promise.allSettled(
    subs.map(async (sub) => {
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
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
        }
      }
    }),
  );
}

export default router;
