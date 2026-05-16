import { pgTable, text, integer, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { topicsTable } from "./topics";

export const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "completed", "skipped"]);
export const taskSourceEnum = pgEnum("task_source", ["auto", "manual"]);

export const studyTasksTable = pgTable("study_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("pending"),
  source: taskSourceEnum("source").notNull().default("manual"),
  topicId: text("topic_id").references(() => topicsTable.id, { onDelete: "set null" }),
  isLocked: text("is_locked").notNull().default("false"),
  sortOrder: integer("sort_order").notNull().default(0),
  scheduledDate: date("scheduled_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStudyTaskSchema = createInsertSchema(studyTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudyTask = z.infer<typeof insertStudyTaskSchema>;
export type StudyTask = typeof studyTasksTable.$inferSelect;
