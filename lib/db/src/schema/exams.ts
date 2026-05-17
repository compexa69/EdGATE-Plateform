import { pgTable, text, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { subjectsTable } from "./subjects";
import { chaptersTable } from "./chapters";
import { topicsTable } from "./topics";
import { questionsTable } from "./questions";

export const examTypeEnum = pgEnum("exam_type", ["lecture_quiz", "dpp", "pyq", "topic_test", "chapter_test", "subject_test", "grand_test", "drill"]);

export const examsTable = pgTable("exams", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: examTypeEnum("type").notNull(),
  subjectId: text("subject_id").references(() => subjectsTable.id, { onDelete: "set null" }),
  chapterId: text("chapter_id").references(() => chaptersTable.id, { onDelete: "set null" }),
  topicId: text("topic_id").references(() => topicsTable.id, { onDelete: "set null" }),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  passingScore: integer("passing_score"),
  negativeMarking: real("negative_marking").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const examQuestionsTable = pgTable("exam_questions", {
  id: text("id").primaryKey(),
  examId: text("exam_id").notNull().references(() => examsTable.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
});

export const insertExamSchema = createInsertSchema(examsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExam = z.infer<typeof insertExamSchema>;
export type Exam = typeof examsTable.$inferSelect;
