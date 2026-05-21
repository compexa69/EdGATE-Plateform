import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth, getUserById } from "../lib/auth";
import { formatUser } from "./auth";
import { getDownloadSignedUrl, deleteObject } from "../lib/b2";

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const base = formatUser(user);
  let photoUrl: string | null = null;
  if (user.photoB2Key) {
    try { photoUrl = await getDownloadSignedUrl(user.photoB2Key); } catch { /* ignore */ }
  }
  res.json({ ...base, photoUrl });
});

router.patch("/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, string> = {};
  if (parsed.data.fullName) updates.fullName = parsed.data.fullName;
  if (parsed.data.mobile) updates.mobile = parsed.data.mobile;

  if ((req.body as any).photoB2Key) {
    updates.photoB2Key = (req.body as any).photoB2Key;
  }

  const [user] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  const base = formatUser(user);
  let photoUrl: string | null = null;
  if (user.photoB2Key) {
    try { photoUrl = await getDownloadSignedUrl(user.photoB2Key); } catch { /* ignore */ }
  }
  res.json({ ...base, photoUrl });
});

router.delete("/profile/photo", requireAuth, async (req, res): Promise<void> => {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.photoB2Key) {
    res.status(404).json({ error: "No profile photo to remove" });
    return;
  }

  try {
    await deleteObject(user.photoB2Key);
  } catch {
    /* B2 delete failure is non-fatal — still clear the DB key */
  }

  await db.update(usersTable)
    .set({ photoB2Key: null })
    .where(eq(usersTable.id, user.id));

  res.json({ success: true, message: "Profile photo removed" });
});

router.delete("/profile", requireAuth, async (req, res): Promise<void> => {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === "super_admin") {
    res.status(403).json({ error: "Super admin accounts cannot be self-deleted. Transfer ownership first." });
    return;
  }

  if (user.photoB2Key) {
    try { await deleteObject(user.photoB2Key); } catch { /* non-fatal */ }
  }

  await db.update(usersTable).set({
    deletedAt: new Date(),
    fullName: "Deleted User",
    email: `deleted_${user.id}@deleted.invalid`,
    mobile: "+910000000000",
    photoB2Key: null,
    emailVerifyToken: null,
    passwordResetToken: null,
    emailChangeToken: null,
    emailChangeNewEmail: null,
  }).where(eq(usersTable.id, user.id));

  res.json({ success: true, message: "Account deleted. We're sorry to see you go." });
});

export default router;
