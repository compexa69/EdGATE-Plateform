import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { questionsTable } from "./questions";

export const qrScanLogsTable = pgTable("qr_scan_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull().references(() => questionsTable.id, { onDelete: "cascade" }),
  examId: text("exam_id"),
  resultId: text("result_id"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
});

export type QrScanLog = typeof qrScanLogsTable.$inferSelect;
