import { Router, type IRouter } from "express";
import { db, notesTable, chaptersTable, topicsTable, topicProgressTable, examsTable, examResultsTable, inlineNotesTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ListNotesQueryParams,
  DeleteNoteParams,
} from "@workspace/api-zod";
import { requireApproved } from "../lib/auth";
import { getUploadSignedUrl, getDownloadSignedUrl, deleteObject } from "../lib/b2";
import { sendStorageAlertEmail } from "../lib/email";
import { logger } from "../lib/logger";

const STORAGE_ALERT_THRESHOLD = 8 * 1024 * 1024 * 1024;
let lastStorageAlertSent = 0;

/** PDF upload is unlocked when the user has submitted at least one chapter_test attempt for the chapter. */
async function checkNotesUploadUnlocked(chapterId: string, userId: string): Promise<boolean> {
  const chapterExams = await db.select().from(examsTable)
    .where(and(eq(examsTable.chapterId, chapterId), eq(examsTable.type, "chapter_test")));
  if (chapterExams.length === 0) {
    // No chapter test exists yet — check fallback: all topics in chapter must have topicTestPassed
    const topics = await db.select().from(topicsTable).where(eq(topicsTable.chapterId, chapterId));
    if (topics.length === 0) return false;
    for (const t of topics) {
      const [prog] = await db.select().from(topicProgressTable)
        .where(and(eq(topicProgressTable.topicId, t.id), eq(topicProgressTable.userId, userId)));
      if (!prog?.topicTestPassed) return false;
    }
    return true;
  }
  for (const exam of chapterExams) {
    const [result] = await db.select().from(examResultsTable)
      .where(and(eq(examResultsTable.examId, exam.id), eq(examResultsTable.userId, userId)));
    if (result) return true;
  }
  return false;
}

const router: IRouter = Router();

const USER_STORAGE_LIMIT = 500 * 1024 * 1024;
const GLOBAL_STORAGE_LIMIT = 9 * 1024 * 1024 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

router.get("/notes", requireApproved, async (req, res): Promise<void> => {
  const params = ListNotesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let notes;
  if (params.data.chapterId) {
    notes = await db.select().from(notesTable)
      .where(and(eq(notesTable.userId, req.user!.id), eq(notesTable.chapterId, params.data.chapterId)));
  } else {
    notes = await db.select().from(notesTable).where(eq(notesTable.userId, req.user!.id));
  }

  const result = await Promise.all(notes.map(async (n) => {
    const [ch] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, n.chapterId));
    return {
      id: n.id, userId: n.userId, chapterId: n.chapterId,
      chapterName: ch?.name ?? "Unknown", fileName: n.fileName,
      fileSizeBytes: n.fileSizeBytes, b2Key: n.b2Key,
      uploadedAt: n.uploadedAt.toISOString(),
    };
  }));

  res.json(result);
});

router.get("/notes/:noteId/annotations", requireApproved, async (req, res): Promise<void> => {
  const noteId = String(req.params.noteId);
  const [note] = await db.select().from(notesTable)
    .where(and(eq(notesTable.id, noteId), eq(notesTable.userId, req.user!.id)));
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  res.json({ noteId, annotations: note.annotations ?? null, updatedAt: note.uploadedAt.toISOString() });
});

router.put("/notes/:noteId/annotations", requireApproved, async (req, res): Promise<void> => {
  const noteId = String(req.params.noteId);
  const { annotations } = req.body as { annotations?: string };
  if (typeof annotations !== "string") {
    res.status(400).json({ error: "annotations (string) is required" });
    return;
  }
  const [note] = await db.select().from(notesTable)
    .where(and(eq(notesTable.id, noteId), eq(notesTable.userId, req.user!.id)));
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  const [updated] = await db.update(notesTable)
    .set({ annotations })
    .where(eq(notesTable.id, noteId))
    .returning();
  res.json({ noteId, annotations: updated.annotations ?? null, updatedAt: updated.uploadedAt.toISOString() });
});

router.delete("/notes/:noteId", requireApproved, async (req, res): Promise<void> => {
  const params = DeleteNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [note] = await db.select().from(notesTable)
    .where(and(eq(notesTable.id, params.data.noteId), eq(notesTable.userId, req.user!.id)));

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  await deleteObject(note.b2Key);
  await db.delete(notesTable).where(eq(notesTable.id, note.id));
  res.sendStatus(204);
});

router.post("/b2/upload-url", requireApproved, async (req, res): Promise<void> => {
  const { chapterId, fileName, fileSizeBytes } = req.body as {
    chapterId: string; fileName: string; fileSizeBytes: number;
  };

  const unlocked = await checkNotesUploadUnlocked(chapterId, req.user!.id);
  if (!unlocked) {
    res.status(403).json({
      error: "Notes upload is locked",
      reason: "Attempt the Chapter Test for this chapter to unlock PDF upload.",
    });
    return;
  }

  if (fileSizeBytes > MAX_FILE_SIZE) {
    res.status(400).json({ error: "File too large. Maximum allowed size is 10 MB." });
    return;
  }

  const userNotes = await db.select().from(notesTable).where(eq(notesTable.userId, req.user!.id));
  const userUsage = userNotes.reduce((sum, n) => sum + n.fileSizeBytes, 0);

  if (userUsage + fileSizeBytes > USER_STORAGE_LIMIT) {
    res.status(429).json({ error: "Storage quota exceeded. You have used your 500 MB limit." });
    return;
  }

  const allNotes = await db.select().from(notesTable);
  const globalUsage = allNotes.reduce((sum, n) => sum + n.fileSizeBytes, 0);

  if (globalUsage + fileSizeBytes > GLOBAL_STORAGE_LIMIT) {
    res.status(429).json({ error: "Global storage capacity reached. Uploads are temporarily paused." });
    return;
  }

  const b2Key = `notes/${req.user!.id}/${chapterId}/${nanoid()}-${fileName}`;
  const uploadUrl = await getUploadSignedUrl(b2Key, "application/pdf");

  res.json({ uploadUrl, b2Key, expiresIn: 900 });
});

router.post("/b2/download-url", requireApproved, async (req, res): Promise<void> => {
  const { noteId } = req.body as { noteId: string };

  const [note] = await db.select().from(notesTable)
    .where(and(eq(notesTable.id, noteId), eq(notesTable.userId, req.user!.id)));

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  const downloadUrl = await getDownloadSignedUrl(note.b2Key);
  res.json({ downloadUrl, expiresIn: 900 });
});

router.post("/b2/profile-upload-url", requireApproved, async (req, res): Promise<void> => {
  const { fileName } = req.body as { fileName: string };
  const b2Key = `profiles/${req.user!.id}/${nanoid()}-${fileName}`;
  const uploadUrl = await getUploadSignedUrl(b2Key, "image/jpeg");
  res.json({ uploadUrl, b2Key, expiresIn: 900 });
});

router.post("/b2/profile-download-url", requireApproved, async (req, res): Promise<void> => {
  const { userId } = req.body as { userId: string };
  const b2Key = `profiles/${userId}/`;
  const downloadUrl = await getDownloadSignedUrl(b2Key);
  res.json({ downloadUrl, expiresIn: 900 });
});

router.post("/b2/confirm-upload", requireApproved, async (req, res): Promise<void> => {
  const { chapterId, fileName, fileSizeBytes, b2Key } = req.body as {
    chapterId: string; fileName: string; fileSizeBytes: number; b2Key: string;
  };

  const unlocked = await checkNotesUploadUnlocked(chapterId, req.user!.id);
  if (!unlocked) {
    res.status(403).json({
      error: "Notes upload is locked",
      reason: "Attempt the Chapter Test for this chapter to unlock PDF upload.",
    });
    return;
  }

  const [note] = await db.insert(notesTable).values({
    id: nanoid(),
    userId: req.user!.id,
    chapterId,
    fileName,
    fileSizeBytes,
    b2Key,
  }).returning();

  const [ch] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, chapterId));

  res.status(201).json({
    id: note.id, userId: note.userId, chapterId: note.chapterId,
    chapterName: ch?.name ?? "Unknown", fileName: note.fileName,
    fileSizeBytes: note.fileSizeBytes, b2Key: note.b2Key,
    uploadedAt: note.uploadedAt.toISOString(),
  });

  // Fire storage alert email when global usage crosses 8 GB threshold — debounced to once per 24h
  try {
    const allNotesAfter = await db.select().from(notesTable);
    const globalUsageAfter = allNotesAfter.reduce((sum, n) => sum + n.fileSizeBytes, 0);
    const hoursSinceLastAlert = (Date.now() - lastStorageAlertSent) / (1000 * 60 * 60);
    if (globalUsageAfter >= STORAGE_ALERT_THRESHOLD && hoursSinceLastAlert >= 24) {
      lastStorageAlertSent = Date.now();
      const superAdmins = await db.select().from(usersTable)
        .where(eq(usersTable.role, "super_admin"));
      const usedGB = globalUsageAfter / (1024 * 1024 * 1024);
      const limitGB = GLOBAL_STORAGE_LIMIT / (1024 * 1024 * 1024);
      for (const admin of superAdmins) {
        await sendStorageAlertEmail(admin.email, usedGB, limitGB);
      }
      logger.warn({ globalUsageAfter, usedGB }, "Storage alert email sent to super_admins");
    }
  } catch (alertErr) {
    logger.error({ alertErr }, "Failed to check/send storage alert email");
  }
});

router.get("/b2/quota", requireApproved, async (req, res): Promise<void> => {
  const userNotes = await db.select().from(notesTable).where(eq(notesTable.userId, req.user!.id));
  const allNotes = await db.select().from(notesTable);
  const userUsageBytes = userNotes.reduce((sum, n) => sum + n.fileSizeBytes, 0);
  const globalUsageBytes = allNotes.reduce((sum, n) => sum + n.fileSizeBytes, 0);

  res.json({
    userUsageBytes,
    userLimitBytes: USER_STORAGE_LIMIT,
    userUsagePercent: Math.round((userUsageBytes / USER_STORAGE_LIMIT) * 100),
    globalUsageBytes,
    globalLimitBytes: GLOBAL_STORAGE_LIMIT,
  });
});

router.get("/notes/inline/:topicId", requireApproved, async (req, res): Promise<void> => {
  const { topicId } = req.params;
  const [note] = await db.select()
    .from(inlineNotesTable)
    .where(and(eq(inlineNotesTable.userId, req.user!.id), eq(inlineNotesTable.topicId, topicId)));
  res.json({
    topicId,
    content: note?.content ?? "",
    updatedAt: (note?.updatedAt ?? new Date()).toISOString(),
  });
});

router.put("/notes/inline/:topicId", requireApproved, async (req, res): Promise<void> => {
  const { topicId } = req.params;
  const { content } = req.body as { content: string };
  if (typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const now = new Date();
  const [existing] = await db.select({ id: inlineNotesTable.id })
    .from(inlineNotesTable)
    .where(and(eq(inlineNotesTable.userId, req.user!.id), eq(inlineNotesTable.topicId, topicId)));
  if (existing) {
    await db.update(inlineNotesTable)
      .set({ content, updatedAt: now })
      .where(eq(inlineNotesTable.id, existing.id));
  } else {
    await db.insert(inlineNotesTable).values({
      id: nanoid(),
      userId: req.user!.id,
      topicId,
      content,
    });
  }
  res.json({ topicId, content, updatedAt: now.toISOString() });
});

export default router;
