import { Router, type IRouter } from "express";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth, getUserById } from "../lib/auth";
import { formatUser } from "./auth";
import { getDownloadSignedUrl, deleteObject } from "../lib/b2";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const base = formatUser(user);
  let photoUrl: string | null = null;
  if (user.photo_b2_key) {
    try { photoUrl = await getDownloadSignedUrl(user.photo_b2_key); } catch { /* ignore */ }
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
  if (parsed.data.fullName) updates.full_name = parsed.data.fullName;
  if (parsed.data.mobile) updates.mobile = parsed.data.mobile;

  if ((req.body as any).photoB2Key) {
    updates.photo_b2_key = (req.body as any).photoB2Key;
  }

  const { data: user } = await supabase.from("users")
    .update(updates)
    .eq("id", req.user!.id)
    .select()
    .single();

  const base = formatUser(user);
  let photoUrl: string | null = null;
  if (user.photo_b2_key) {
    try { photoUrl = await getDownloadSignedUrl(user.photo_b2_key); } catch { /* ignore */ }
  }
  res.json({ ...base, photoUrl });
});

router.delete("/profile/photo", requireAuth, async (req, res): Promise<void> => {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.photo_b2_key) {
    res.status(404).json({ error: "No profile photo to remove" });
    return;
  }

  try {
    await deleteObject(user.photo_b2_key);
  } catch {
    /* B2 delete failure is non-fatal — still clear the DB key */
  }

  await supabase.from("users").update({ photo_b2_key: null }).eq("id", user.id);

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

  if (user.photo_b2_key) {
    try { await deleteObject(user.photo_b2_key); } catch { /* non-fatal */ }
  }

  await supabase.from("users").update({
    deleted_at: new Date().toISOString(),
    full_name: "Deleted User",
    email: `deleted_${user.id}@deleted.invalid`,
    mobile: "+910000000000",
    photo_b2_key: null,
    email_verify_token: null,
    password_reset_token: null,
    email_change_token: null,
    email_change_new_email: null,
  }).eq("id", user.id);

  res.json({ success: true, message: "Account deleted. We're sorry to see you go." });
});

export default router;
