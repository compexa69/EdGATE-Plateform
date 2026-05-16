import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { chaptersTable } from "./chapters";

export const notesTable = pgTable("notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").notNull().references(() => chaptersTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  b2Key: text("b2_key").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNoteSchema = createInsertSchema(notesTable).omit({ id: true, uploadedAt: true });
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notesTable.$inferSelect;
