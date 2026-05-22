import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import {
  ListNotesQueryParams,
  DeleteNoteParams,
} from "@workspace/api-zod";
import { requireApproved } from "../lib/auth";
import { getUploadSignedUrl, getDownloadSignedUrl, deleteObject } from "../lib/b2";
import { sendStorageAlertEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";

const STORAGE_ALERT_THRESHOLD = 8 * 1024 * 1024 * 1024;
let lastStorageAlertSent = 0;

async function checkNotesUploadUnlocked(chapterId: string, userId: string): Promise<boolean> {
  const { data: chapterExams } = await supabase.from("exams")
    .select("id")
    .eq("chapter_id", chapterId)
    .eq("type", "chapter_test");

  if (!chapterExams || chapterExams.length === 0) {
    const { data: topics } = await supabase.from("topics").select("id").eq("chapter_id", chapterId);
    if (!topics || topics.length === 0) return false;
    for (const t of topics) {
      const { data: prog } = await supabase.from("topic_progress")
        .select("topic_test_passed")
        .eq("topic_id", t.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!prog?.topic_test_passed) return false;
    }
    return true;
  }
  for (const exam of chapterExams) {
    const { data: result } = await supabase.from("exam_results")
      .select("id")
      .eq("exam_id", exam.id)
      .eq("user_id", userId)
      .maybeSingle();
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

  let query = supabase.from("notes").select("*").eq("user_id", req.user!.id);
  if (params.data.chapterId) {
    query = query.eq("chapter_id", params.data.chapterId);
  }
  const { data: notes } = await query;

  const result = await Promise.all((notes ?? []).map(async (n) => {
    const { data: ch } = await supabase.from("chapters").select("name").eq("id", n.chapter_id).maybeSingle();
    return {
      id: n.id, userId: n.user_id, chapterId: n.chapter_id,
      chapterName: ch?.name ?? "Unknown", fileName: n.file_name,
      fileSizeBytes: n.file_size_bytes, b2Key: n.b2_key,
      uploadedAt: n.uploaded_at,
      hasAnnotations: !!(n.annotations && n.annotations.trim().length > 0),
    };
  }));

  res.json(result);
});

router.get("/notes/:noteId/annotations", requireApproved, async (req, res): Promise<void> => {
  const noteId = String(req.params.noteId);
  const { data: note } = await supabase.from("notes")
    .select("*")
    .eq("id", noteId)
    .eq("user_id", req.user!.id)
    .maybeSingle();
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  res.json({ noteId, annotations: note.annotations ?? null, updatedAt: note.uploaded_at });
});

router.put("/notes/:noteId/annotations", requireApproved, async (req, res): Promise<void> => {
  const noteId = String(req.params.noteId);
  const { annotations } = req.body as { annotations?: string };
  if (typeof annotations !== "string") {
    res.status(400).json({ error: "annotations (string) is required" });
    return;
  }
  const { data: note } = await supabase.from("notes")
    .select("id")
    .eq("id", noteId)
    .eq("user_id", req.user!.id)
    .maybeSingle();
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  const { data: updated } = await supabase.from("notes")
    .update({ annotations })
    .eq("id", noteId)
    .select()
    .single();
  res.json({ noteId, annotations: updated.annotations ?? null, updatedAt: updated.uploaded_at });
});

router.delete("/notes/:noteId", requireApproved, async (req, res): Promise<void> => {
  const params = DeleteNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data: note } = await supabase.from("notes")
    .select("*")
    .eq("id", params.data.noteId)
    .eq("user_id", req.user!.id)
    .maybeSingle();

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  await deleteObject(note.b2_key);
  await supabase.from("notes").delete().eq("id", note.id);
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

  const { data: userNotes } = await supabase.from("notes").select("file_size_bytes").eq("user_id", req.user!.id);
  const userUsage = (userNotes ?? []).reduce((sum, n) => sum + n.file_size_bytes, 0);

  if (userUsage + fileSizeBytes > USER_STORAGE_LIMIT) {
    res.status(429).json({ error: "Storage quota exceeded. You have used your 500 MB limit." });
    return;
  }

  const { data: allNotes } = await supabase.from("notes").select("file_size_bytes");
  const globalUsage = (allNotes ?? []).reduce((sum, n) => sum + n.file_size_bytes, 0);

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

  const { data: note } = await supabase.from("notes")
    .select("*")
    .eq("id", noteId)
    .eq("user_id", req.user!.id)
    .maybeSingle();

  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  const downloadUrl = await getDownloadSignedUrl(note.b2_key);
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

  const { data: note } = await supabase.from("notes").insert({
    id: nanoid(),
    user_id: req.user!.id,
    chapter_id: chapterId,
    file_name: fileName,
    file_size_bytes: fileSizeBytes,
    b2_key: b2Key,
  }).select().single();

  const { data: ch } = await supabase.from("chapters").select("name").eq("id", chapterId).maybeSingle();

  res.status(201).json({
    id: note.id, userId: note.user_id, chapterId: note.chapter_id,
    chapterName: ch?.name ?? "Unknown", fileName: note.file_name,
    fileSizeBytes: note.file_size_bytes, b2Key: note.b2_key,
    uploadedAt: note.uploaded_at,
  });

  try {
    const { data: allNotesAfter } = await supabase.from("notes").select("file_size_bytes");
    const globalUsageAfter = (allNotesAfter ?? []).reduce((sum, n) => sum + n.file_size_bytes, 0);
    const hoursSinceLastAlert = (Date.now() - lastStorageAlertSent) / (1000 * 60 * 60);
    if (globalUsageAfter >= STORAGE_ALERT_THRESHOLD && hoursSinceLastAlert >= 24) {
      lastStorageAlertSent = Date.now();
      const { data: superAdmins } = await supabase.from("users").select("email").eq("role", "super_admin");
      const usedGB = globalUsageAfter / (1024 * 1024 * 1024);
      const limitGB = GLOBAL_STORAGE_LIMIT / (1024 * 1024 * 1024);
      for (const admin of superAdmins ?? []) {
        await sendStorageAlertEmail(admin.email, usedGB, limitGB);
      }
      logger.warn({ globalUsageAfter, usedGB }, "Storage alert email sent to super_admins");
    }
  } catch (alertErr) {
    logger.error({ alertErr }, "Failed to check/send storage alert email");
  }
});

router.get("/b2/quota", requireApproved, async (req, res): Promise<void> => {
  const [{ data: userNotes }, { data: allNotes }] = await Promise.all([
    supabase.from("notes").select("file_size_bytes").eq("user_id", req.user!.id),
    supabase.from("notes").select("file_size_bytes"),
  ]);
  const userUsageBytes = (userNotes ?? []).reduce((sum, n) => sum + n.file_size_bytes, 0);
  const globalUsageBytes = (allNotes ?? []).reduce((sum, n) => sum + n.file_size_bytes, 0);

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
  const { data: note } = await supabase.from("inline_notes")
    .select("*")
    .eq("user_id", req.user!.id)
    .eq("topic_id", topicId)
    .maybeSingle();
  res.json({
    topicId,
    content: note?.content ?? "",
    updatedAt: note?.updated_at ?? new Date().toISOString(),
  });
});

router.put("/notes/inline/:topicId", requireApproved, async (req, res): Promise<void> => {
  const { topicId } = req.params;
  const { content } = req.body as { content: string };
  if (typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from("inline_notes")
    .select("id")
    .eq("user_id", req.user!.id)
    .eq("topic_id", topicId)
    .maybeSingle();
  if (existing) {
    await supabase.from("inline_notes")
      .update({ content, updated_at: now })
      .eq("id", existing.id);
  } else {
    await supabase.from("inline_notes").insert({
      id: nanoid(),
      user_id: req.user!.id,
      topic_id: topicId,
      content,
    });
  }
  res.json({ topicId, content, updatedAt: now });
});

export default router;
