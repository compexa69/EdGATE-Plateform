import { pgTable, text, boolean, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { topicsTable } from "./topics";

export const topicProgressTable = pgTable("topic_progress", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  topicId: text("topic_id").notNull().references(() => topicsTable.id, { onDelete: "cascade" }),
  lectureClickCount: integer("lecture_click_count").notNull().default(0),
  lectureQuizPassed: boolean("lecture_quiz_passed").notNull().default(false),
  dppCompleted: boolean("dpp_completed").notNull().default(false),
  pyqCompleted: boolean("pyq_completed").notNull().default(false),
  topicTestPassed: boolean("topic_test_passed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userTopicUnique: unique().on(table.userId, table.topicId),
}));

export const insertTopicProgressSchema = createInsertSchema(topicProgressTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTopicProgress = z.infer<typeof insertTopicProgressSchema>;
export type TopicProgress = typeof topicProgressTable.$inferSelect;
