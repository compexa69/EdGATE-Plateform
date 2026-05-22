import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import { supabase } from "../lib/supabase";
import { hashPassword, signToken } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const SEED_KEY = process.env.SEED_KEY ?? "";
const INDIAN_MOBILE_REGEX = /^(\+91)[\s-]?[6-9]\d{9}$/;

/**
 * POST /api/seed/super-admin
 *
 * One-time bootstrap endpoint. Creates the first super-admin account.
 *
 * Guards:
 *  1. Requires the correct SEED_KEY in the request body (set as a secret env var).
 *  2. Refuses if any user already exists in the database.
 *
 * Body:
 *  { seedKey, email, password, fullName, mobile }
 *
 * Response:
 *  { user, token, message }
 */
router.post("/seed/super-admin", async (req, res): Promise<void> => {
  if (!SEED_KEY) {
    res.status(503).json({
      error: "Seed endpoint is disabled. Set the SEED_KEY environment variable to enable it.",
    });
    return;
  }

  const { seedKey, email, password, fullName, mobile } = req.body as {
    seedKey?: string;
    email?: string;
    password?: string;
    fullName?: string;
    mobile?: string;
  };

  if (!seedKey || seedKey !== SEED_KEY) {
    logger.warn({ ip: req.ip }, "Seed endpoint called with invalid SEED_KEY");
    res.status(403).json({ error: "Invalid seed key." });
    return;
  }

  if (!email || !password || !fullName || !mobile) {
    res.status(400).json({ error: "email, password, fullName, and mobile are all required." });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email address." });
    return;
  }

  if (!INDIAN_MOBILE_REGEX.test(mobile)) {
    res.status(400).json({ error: "Please enter a valid Indian mobile number (+91...)." });
    return;
  }

  const strengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!strengthRegex.test(password)) {
    res.status(400).json({
      error:
        "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.",
    });
    return;
  }

  const { count } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    res.status(409).json({
      error:
        "Database already has users. This endpoint only works on a fresh database. Use the normal login instead.",
    });
    return;
  }

  const passwordHash = await hashPassword(password);

  const { data: user, error } = await supabase
    .from("users")
    .insert({
      id: nanoid(),
      full_name: fullName,
      email: email.toLowerCase().trim(),
      mobile,
      password_hash: passwordHash,
      role: "super_admin",
      status: "approved",
      email_verified: true,
    })
    .select()
    .single();

  if (error || !user) {
    logger.error({ error }, "Seed: failed to create super-admin");
    res.status(500).json({ error: "Failed to create super-admin account." });
    return;
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
  });

  logger.info({ userId: user.id, email: user.email }, "Super-admin seeded successfully");

  res.status(201).json({
    message: "Super-admin account created successfully. You are now logged in.",
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.email_verified,
    },
    token,
  });
});

export default router;
