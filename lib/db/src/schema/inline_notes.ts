import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { topicsTable } from "./topics";

export const inlineNotesTable = pgTable("inline_notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  topicId: text("topic_id").notNull().references(() => topicsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InlineNote = typeof inlineNotesTable.$inferSelect;
