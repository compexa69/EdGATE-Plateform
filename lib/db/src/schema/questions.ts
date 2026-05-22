import { pgTable, text, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { topicsTable } from "./topics";

export const difficultyEnum = pgEnum("difficulty", ["easy", "medium", "hard"]);

export const questionsTable = pgTable("questions", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").references(() => topicsTable.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  options: text("options").array().notNull(),
  correctOption: text("correct_option").notNull(),
  marks: real("marks").notNull().default(4),
  imageUrl: text("image_url"),
  textSolution: text("text_solution"),
  videoUrl: text("video_url"),
  qrCodeSvg: text("qr_code_svg"),
  difficulty: difficultyEnum("difficulty").notNull().default("medium"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
