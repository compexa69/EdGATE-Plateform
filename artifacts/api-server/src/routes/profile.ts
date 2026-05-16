import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth, getUserById } from "../lib/auth";
import { formatUser } from "./auth";

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
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

  const [user] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.user!.id))
    .returning();

  res.json(formatUser(user));
});

export default router;
