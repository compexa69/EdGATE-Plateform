import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const revokedTokensTable = pgTable("revoked_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull().defaultNow(),
});
