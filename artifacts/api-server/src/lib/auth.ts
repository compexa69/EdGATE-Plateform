import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { createHash } from "crypto";
import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable, revokedTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const SALT_ROUNDS = 10;

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  status: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): (AuthUser & { iat?: number; exp?: number }) | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser & { iat?: number; exp?: number };
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function revokeToken(token: string, expiresAt: Date): Promise<void> {
  const tokenHash = hashToken(token);
  await db
    .insert(revokedTokensTable)
    .values({ tokenHash, expiresAt })
    .onConflictDoNothing();
}

export async function isTokenRevoked(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ tokenHash: revokedTokensTable.tokenHash })
    .from(revokedTokensTable)
    .where(eq(revokedTokensTable.tokenHash, tokenHash));
  return !!row;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const revoked = await isTokenRevoked(token);
  if (revoked) {
    res.status(401).json({ error: "Token has been revoked" });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

export function requireApproved(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.status !== "approved") {
      res.status(403).json({ error: "Account not approved" });
      return;
    }
    next();
  });
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user ?? null;
}
