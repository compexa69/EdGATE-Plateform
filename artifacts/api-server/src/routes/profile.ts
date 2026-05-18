import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth, requireApproved, getUserById } from "../lib/auth";
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

  // Allow updating photo b2Key directly
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

router.delete("/profile/photo", requireApproved, async (req, res): Promise<void> => {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.photoB2Key) {
    res.status(404).json({ error: "No profile photo to remove" });
    return;
  }

  await deleteObject(user.photoB2Key);

  await db.update(usersTable)
    .set({ photoB2Key: null })
    .where(eq(usersTable.id, user.id));

  res.json({ success: true, message: "Profile photo removed" });
});

export default router;
