import { pgTable, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "student"]);
export const userStatusEnum = pgEnum("user_status", ["pending_approval", "approved", "suspended", "banned"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  mobile: text("mobile").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("student"),
  status: userStatusEnum("status").notNull().default("pending_approval"),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifyToken: text("email_verify_token"),
  emailVerifyExpiry: timestamp("email_verify_expiry", { withTimezone: true }),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry", { withTimezone: true }),
  photoB2Key: text("photo_b2_key"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
