import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  RegisterBody,
  LoginBody,
  VerifyEmailBody,
  ResendVerificationBody,
  ChangePasswordBody,
  ForgotPasswordBody,
} from "@workspace/api-zod";
import {
  signToken,
  hashPassword,
  comparePassword,
  requireAuth,
  getUserById,
} from "../lib/auth";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendEmailChangeVerification,
} from "../lib/email";

const router: IRouter = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile,
    mobileMasked: user.mobile.replace(/(\+91\s?)(\d{2})\d{6}(\d{2})/, "$1$2******$3"),
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    isApproved: user.status === "approved",
    photoUrl: null as string | null,
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

const INDIAN_MOBILE_REGEX = /^(\+91)[\s-]?[6-9]\d{9}$/;

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fullName, mobile, email, password } = parsed.data;

  if (!INDIAN_MOBILE_REGEX.test(mobile)) {
    res.status(400).json({ error: "Please enter a valid Indian mobile number (+91...)" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const count = await db.select().from(usersTable);
  const isFirstUser = count.length === 0;

  const passwordHash = await hashPassword(password);
  const verifyToken = randomBytes(3).toString("hex").toUpperCase();
  const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [user] = await db.insert(usersTable).values({
    id: nanoid(),
    fullName,
    email,
    mobile,
    passwordHash,
    role: isFirstUser ? "super_admin" : "student",
    status: isFirstUser ? "approved" : "pending_approval",
    emailVerified: isFirstUser,
    emailVerifyToken: isFirstUser ? null : verifyToken,
    emailVerifyExpiry: isFirstUser ? null : verifyExpiry,
  }).returning();

  if (!isFirstUser) {
    try {
      await sendVerificationEmail(email, verifyToken);
    } catch (err) {
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
      res.status(503).json({ error: "Failed to send verification email. Please try again shortly." });
      return;
    }
    sendWelcomeEmail(email, fullName).catch(() => {});
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role, status: user.status });
  res.status(201).json({
    user: formatUser(user),
    token,
    message: isFirstUser
      ? "Welcome! You are the super admin."
      : "Registration successful. Please verify your email.",
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.deletedAt) {
    res.status(403).json({ error: "This account has been deleted" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!user.emailVerified) {
    res.status(403).json({ error: "Please verify your email before logging in" });
    return;
  }

  if (user.status === "suspended" || user.status === "banned") {
    res.status(403).json({ error: "Account suspended or banned" });
    return;
  }

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  const token = signToken({ id: user.id, email: user.email, role: user.role, status: user.status });
  res.json({ user: formatUser(user), token });
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.json({ success: true, message: "Logged out" });
});

router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = VerifyEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { token } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.emailVerifyToken, token));
  if (!user) {
    res.status(400).json({ error: "Invalid or expired token" });
    return;
  }

  if (user.emailVerifyExpiry && user.emailVerifyExpiry < new Date()) {
    res.status(400).json({ error: "Token expired" });
    return;
  }

  await db.update(usersTable)
    .set({ emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null })
    .where(eq(usersTable.id, user.id));

  res.json({ success: true, message: "Email verified successfully" });
});

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const parsed = ResendVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (!user || user.emailVerified) {
    res.json({ success: true, message: "If that email is registered and unverified, a new code was sent" });
    return;
  }

  const verifyToken = randomBytes(3).toString("hex").toUpperCase();
  const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.update(usersTable)
    .set({ emailVerifyToken: verifyToken, emailVerifyExpiry: verifyExpiry })
    .where(eq(usersTable.id, user.id));

  await sendVerificationEmail(user.email, verifyToken);
  res.json({ success: true, message: "Verification email sent" });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await comparePassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const isSamePassword = await comparePassword(parsed.data.newPassword, user.passwordHash);
  if (isSamePassword) {
    res.status(400).json({ error: "New password cannot be the same as your current password" });
    return;
  }

  const strengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!strengthRegex.test(parsed.data.newPassword)) {
    res.status(400).json({
      error: "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.",
    });
    return;
  }

  const hash = await hashPassword(parsed.data.newPassword);
  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, user.id));

  res.json({ success: true, message: "Password changed successfully" });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (user) {
    const resetToken = randomBytes(3).toString("hex").toUpperCase();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(usersTable)
      .set({ passwordResetToken: resetToken, passwordResetExpiry: resetExpiry })
      .where(eq(usersTable.id, user.id));
    await sendPasswordResetEmail(user.email, resetToken);
  }

  res.json({ success: true, message: "If that email is registered, a reset link was sent" });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword) {
    res.status(400).json({ error: "token and newPassword are required" });
    return;
  }

  const strengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!strengthRegex.test(newPassword)) {
    res.status(400).json({
      error: "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.",
    });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.passwordResetToken, token));
  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }

  if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
    res.status(400).json({ error: "Reset code has expired. Please request a new one." });
    return;
  }

  const hash = await hashPassword(newPassword);
  await db.update(usersTable)
    .set({ passwordHash: hash, passwordResetToken: null, passwordResetExpiry: null })
    .where(eq(usersTable.id, user.id));

  res.json({ success: true, message: "Password reset successfully" });
});

router.post("/auth/request-email-change", requireAuth, async (req, res): Promise<void> => {
  const { newEmail } = req.body as { newEmail?: string };
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    res.status(400).json({ error: "A valid new email address is required" });
    return;
  }

  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (newEmail.toLowerCase() === user.email.toLowerCase()) {
    res.status(400).json({ error: "New email must be different from your current email" });
    return;
  }

  const [existingWithEmail] = await db.select().from(usersTable).where(eq(usersTable.email, newEmail));
  if (existingWithEmail) {
    res.status(400).json({ error: "This email is already in use by another account" });
    return;
  }

  const token = randomBytes(3).toString("hex").toUpperCase();
  const expiry = new Date(Date.now() + 60 * 60 * 1000);

  await db.update(usersTable)
    .set({ emailChangeToken: token, emailChangeNewEmail: newEmail, emailChangeExpiry: expiry })
    .where(eq(usersTable.id, user.id));

  try {
    await sendEmailChangeVerification(newEmail, newEmail, token);
  } catch {
    res.status(503).json({ error: "Failed to send verification email. Please try again." });
    return;
  }

  res.json({ success: true, message: "Verification code sent to your new email address." });
});

router.post("/auth/confirm-email-change", requireAuth, async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token) {
    res.status(400).json({ error: "Verification token is required" });
    return;
  }

  const user = await getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.emailChangeToken || user.emailChangeToken !== token.toUpperCase()) {
    res.status(400).json({ error: "Invalid verification code" });
    return;
  }

  if (!user.emailChangeExpiry || user.emailChangeExpiry < new Date()) {
    res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    return;
  }

  const newEmail = user.emailChangeNewEmail!;

  await db.update(usersTable)
    .set({
      email: newEmail,
      emailChangeToken: null,
      emailChangeNewEmail: null,
      emailChangeExpiry: null,
    })
    .where(eq(usersTable.id, user.id));

  res.json({ success: true, message: "Email address updated successfully.", newEmail });
});

export { formatUser };
export default router;
