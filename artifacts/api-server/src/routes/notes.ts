import { Router, type IRouter } from "express";
import { db, notesTable, chaptersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  ListNotesQueryParams,
  DeleteNoteParams,
} from "@workspace/api-zod";
import { requireApproved } from "../lib/auth";
import { getUploadSignedUrl, getDownloadSignedUrl, deleteObject } from "../lib/b2";

const router: IRouter = Router();

const USER_STORAGE_LIMIT = 100 * 1024 * 1024;
const GLOBAL_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024;

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

  const userNotes = await db.select().from(notesTable).where(eq(notesTable.userId, req.user!.id));
  const userUsage = userNotes.reduce((sum, n) => sum + n.fileSizeBytes, 0);

  if (userUsage + fileSizeBytes > USER_STORAGE_LIMIT) {
    res.status(429).json({ error: "Storage quota exceeded" });
    return;
  }

  const b2Key = `notes/${req.user!.id}/${chapterId}/${nanoid()}-${fileName}`;
  const uploadUrl = await getUploadSignedUrl(b2Key, "application/pdf");

  res.json({ uploadUrl, b2Key, expiresIn: 3600 });
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
  res.json({ downloadUrl, expiresIn: 3600 });
});

router.post("/b2/profile-upload-url", requireApproved, async (req, res): Promise<void> => {
  const { fileName } = req.body as { fileName: string };
  const b2Key = `profiles/${req.user!.id}/${nanoid()}-${fileName}`;
  const uploadUrl = await getUploadSignedUrl(b2Key, "image/jpeg");
  res.json({ uploadUrl, b2Key, expiresIn: 3600 });
});

router.post("/b2/profile-download-url", requireApproved, async (req, res): Promise<void> => {
  const { userId } = req.body as { userId: string };
  const b2Key = `profiles/${userId}/`;
  const downloadUrl = await getDownloadSignedUrl(b2Key);
  res.json({ downloadUrl, expiresIn: 3600 });
});

router.post("/b2/confirm-upload", requireApproved, async (req, res): Promise<void> => {
  const { chapterId, fileName, fileSizeBytes, b2Key } = req.body as {
    chapterId: string; fileName: string; fileSizeBytes: number; b2Key: string;
  };

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

export default router;
