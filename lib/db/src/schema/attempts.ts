import { pgTable, text, integer, real, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { examsTable } from "./exams";

export const attemptStatusEnum = pgEnum("attempt_status", ["in_progress", "paused", "submitted", "auto_submitted"]);

export const examAttemptsTable = pgTable("exam_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  examId: text("exam_id").notNull().references(() => examsTable.id, { onDelete: "cascade" }),
  status: attemptStatusEnum("status").notNull().default("in_progress"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull().defaultNow(),
  endTime: timestamp("end_time", { withTimezone: true }),
  pauseCount: integer("pause_count").notNull().default(0),
  remainingSeconds: integer("remaining_seconds").notNull().default(3600),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const attemptAnswersTable = pgTable("attempt_answers", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull().references(() => examAttemptsTable.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  selectedOption: text("selected_option"),
  isMarkedForReview: boolean("is_marked_for_review").notNull().default(false),
  timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const examResultsTable = pgTable("exam_results", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull().references(() => examAttemptsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  examId: text("exam_id").notNull().references(() => examsTable.id, { onDelete: "cascade" }),
  score: real("score").notNull().default(0),
  maxScore: real("max_score").notNull().default(0),
  accuracy: real("accuracy").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  incorrectAnswers: integer("incorrect_answers").notNull().default(0),
  skippedAnswers: integer("skipped_answers").notNull().default(0),
  timeTakenSeconds: integer("time_taken_seconds").notNull().default(0),
  passed: boolean("passed").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttemptSchema = createInsertSchema(examAttemptsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAttempt = z.infer<typeof insertAttemptSchema>;
export type ExamAttempt = typeof examAttemptsTable.$inferSelect;
export type ExamResult = typeof examResultsTable.$inferSelect;
