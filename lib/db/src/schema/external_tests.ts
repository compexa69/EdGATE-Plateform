import { pgTable, text, real, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const externalExamTypeEnum = pgEnum("external_exam_type", [
  "jee_main", "jee_advanced", "neet", "gate", "bitsat", "viteee", "other",
]);

export const externalTestsTable = pgTable("external_tests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  examName: text("exam_name").notNull(),
  examType: externalExamTypeEnum("exam_type").notNull().default("other"),
  score: real("score").notNull(),
  maxScore: real("max_score").notNull(),
  totalQuestions: integer("total_questions"),
  correctAnswers: integer("correct_answers"),
  incorrectAnswers: integer("incorrect_answers"),
  skippedAnswers: integer("skipped_answers"),
  rank: integer("rank"),
  percentile: real("percentile"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExternalTestSchema = createInsertSchema(externalTestsTable).omit({ id: true, createdAt: true });
export type InsertExternalTest = z.infer<typeof insertExternalTestSchema>;
export type ExternalTest = typeof externalTestsTable.$inferSelect;
