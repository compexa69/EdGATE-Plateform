import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { topicsTable } from "./topics";

export const pomodoroSessionsTable = pgTable("pomodoro_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  durationSeconds: integer("duration_seconds").notNull(),
  topicContext: text("topic_context"),
  topicId: text("topic_id").references(() => topicsTable.id, { onDelete: "set null" }),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPomodoroSessionSchema = createInsertSchema(pomodoroSessionsTable).omit({ id: true, createdAt: true });
export type InsertPomodoroSession = z.infer<typeof insertPomodoroSessionSchema>;
export type PomodoroSession = typeof pomodoroSessionsTable.$inferSelect;
