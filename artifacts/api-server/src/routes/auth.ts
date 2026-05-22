import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
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
  revokeToken,
  verifyToken,
  getUserById,
} from "../lib/auth";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendEmailChangeVerification,
} from "../lib/email";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

function formatUser(user: Record<string, any>) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    mobile: user.mobile,
    mobileMasked: user.mobile.replace(/(\+91\s?)(\d{2})\d{6}(\d{2})/, "$1$2******$3"),
    role: user.role,
    status: user.status,
    emailVerified: user.email_verified,
    isApproved: user.status === "approved",
    photoUrl: null as string | null,
    createdAt: user.created_at ?? new Date().toISOString(),
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

  const { data: existing } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
  const isFirstUser = (count ?? 0) === 0;

  const passwordHash = await hashPassword(password);
  const verifyToken = randomBytes(3).toString("hex").toUpperCase();
  const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: user, error } = await supabase.from("users").insert({
    id: nanoid(),
    full_name: fullName,
    email,
    mobile,
    password_hash: passwordHash,
    role: isFirstUser ? "super_admin" : "student",
    status: isFirstUser ? "approved" : "pending_approval",
    email_verified: isFirstUser,
    email_verify_token: isFirstUser ? null : verifyToken,
    email_verify_expiry: isFirstUser ? null : verifyExpiry,
  }).select().single();

  if (error || !user) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }

  if (!isFirstUser) {
    sendVerificationEmail(email, verifyToken).catch((err) => {
      logger.error({ err, email }, "Failed to send verification email during registration");
    });
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

  const { data: user } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.deleted_at) {
    res.status(403).json({ error: "This account has been deleted" });
    return;
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!user.email_verified && process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Please verify your email before logging in" });
    return;
  }

  if (user.status === "suspended" || user.status === "banned") {
    res.status(403).json({ error: "Account suspended or banned" });
    return;
  }

  await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

  const token = signToken({ id: user.id, email: user.email, role: user.role, status: user.status });
  res.json({ user: formatUser(user), token });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    if (decoded?.exp) {
      await revokeToken(token, new Date(decoded.exp * 1000));
    }
  }
  res.json({ success: true, message: "Logged out" });
});

router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = VerifyEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { token } = parsed.data;
  const { data: user } = await supabase.from("users").select("*").eq("email_verify_token", token).maybeSingle();
  if (!user) {
    res.status(400).json({ error: "Invalid or expired token" });
    return;
  }

  if (user.email_verify_expiry && new Date(user.email_verify_expiry) < new Date()) {
    res.status(400).json({ error: "Token expired" });
    return;
  }

  await supabase.from("users")
    .update({ email_verified: true, email_verify_token: null, email_verify_expiry: null })
    .eq("id", user.id);

  res.json({ success: true, message: "Email verified successfully" });
});

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const parsed = ResendVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data: user } = await supabase.from("users").select("*").eq("email", parsed.data.email).maybeSingle();
  if (!user || user.email_verified) {
    res.json({ success: true, message: "If that email is registered and unverified, a new code was sent" });
    return;
  }

  const verifyToken = randomBytes(3).toString("hex").toUpperCase();
  const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("users")
    .update({ email_verify_token: verifyToken, email_verify_expiry: verifyExpiry })
    .eq("id", user.id);

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

  const valid = await comparePassword(parsed.data.currentPassword, user.password_hash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const isSamePassword = await comparePassword(parsed.data.newPassword, user.password_hash);
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
  await supabase.from("users").update({ password_hash: hash }).eq("id", user.id);

  res.json({ success: true, message: "Password changed successfully" });
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data: user } = await supabase.from("users").select("*").eq("email", parsed.data.email).maybeSingle();
  if (user) {
    const resetToken = randomBytes(3).toString("hex").toUpperCase();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await supabase.from("users")
      .update({ password_reset_token: resetToken, password_reset_expiry: resetExpiry })
      .eq("id", user.id);
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

  const hash = await hashPassword(newPassword);

  const { data: updated } = await supabase.from("users")
    .update({ password_hash: hash, password_reset_token: null, password_reset_expiry: null })
    .eq("password_reset_token", token)
    .select("id")
    .maybeSingle();

  if (!updated) {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }

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

  const { data: existingWithEmail } = await supabase.from("users").select("id").eq("email", newEmail).maybeSingle();
  if (existingWithEmail) {
    res.status(400).json({ error: "This email is already in use by another account" });
    return;
  }

  const token = randomBytes(3).toString("hex").toUpperCase();
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await supabase.from("users")
    .update({ email_change_token: token, email_change_new_email: newEmail, email_change_expiry: expiry })
    .eq("id", user.id);

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

  if (!user.email_change_token || user.email_change_token !== token.toUpperCase()) {
    res.status(400).json({ error: "Invalid verification code" });
    return;
  }

  if (!user.email_change_expiry || new Date(user.email_change_expiry) < new Date()) {
    res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    return;
  }

  const newEmail = user.email_change_new_email!;

  await supabase.from("users")
    .update({
      email: newEmail,
      email_change_token: null,
      email_change_new_email: null,
      email_change_expiry: null,
    })
    .eq("id", user.id);

  res.json({ success: true, message: "Email address updated successfully.", newEmail });
});

export { formatUser };
export default router;
