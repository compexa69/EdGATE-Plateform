import { handleCors, json, err } from "../_shared/cors.ts";
import { requireAuth, adminClient } from "../_shared/auth.ts";

interface FlatRow {
  subject_name: string;
  chapter_name: string;
  topic_name: string;
  subject_order?: number;
  subject_description?: string;
  chapter_order?: number;
  chapter_description?: string;
  topic_order?: number;
  topic_description?: string;
  telegram_url?: string;
  telegram_chat_id?: string;
  telegram_message_id?: string;
  youtube_url?: string;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") return err("Method not allowed", 405);

  const actor = await requireAuth(req);
  if (!actor) return err("Unauthorized", 401);
  if (!["admin", "super_admin"].includes(actor.role)) return err("Forbidden — admins only", 403);

  let body: { rows?: FlatRow[] };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const rows: FlatRow[] = body.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return err("rows array is required and must not be empty");

  const validRows = rows.filter(
    (r) => r.subject_name?.trim() && r.chapter_name?.trim() && r.topic_name?.trim()
  );
  if (validRows.length === 0) return err("No valid rows found. Each row needs subject_name, chapter_name, topic_name.");

  const db = adminClient();

  // ── Load all existing subjects, chapters, topics once ─────────────────────
  const [{ data: existingSubjects }, { data: existingChapters }, { data: existingTopics }] =
    await Promise.all([
      db.from("subjects").select("id, name"),
      db.from("chapters").select("id, name, subject_id"),
      db.from("topics").select("id, name, chapter_id"),
    ]);

  // name → id maps (case-insensitive key)
  const subjectMap = new Map<string, string>(
    (existingSubjects ?? []).map((s: { id: string; name: string }) => [s.name.toLowerCase().trim(), s.id])
  );
  const chapterMap = new Map<string, string>(
    (existingChapters ?? []).map((c: { id: string; name: string; subject_id: string }) => [
      `${c.subject_id}::${c.name.toLowerCase().trim()}`,
      c.id,
    ])
  );
  const topicMap = new Map<string, string>(
    (existingTopics ?? []).map((t: { id: string; name: string; chapter_id: string }) => [
      `${t.chapter_id}::${t.name.toLowerCase().trim()}`,
      t.id,
    ])
  );

  const created = { subjects: 0, chapters: 0, topics: 0 };
  const skipped = { subjects: 0, chapters: 0, topics: 0 };

  // ── Collect subjects to insert in batch ───────────────────────────────────
  const subjectsToInsert: Array<{
    id: string; name: string; description: string | null; order: number;
  }> = [];

  // Deduplicate subjects from rows
  const uniqueSubjects = new Map<string, { order: number; description?: string }>();
  for (const row of validRows) {
    const key = row.subject_name.toLowerCase().trim();
    if (!subjectMap.has(key) && !uniqueSubjects.has(key)) {
      uniqueSubjects.set(key, {
        order: row.subject_order ?? 0,
        description: row.subject_description,
      });
    } else if (subjectMap.has(key)) {
      skipped.subjects++;
    }
  }

  // Deduplicate skipped counts: only count each unique subject name once
  const countedSubjectSkips = new Set<string>();

  for (const row of validRows) {
    const key = row.subject_name.toLowerCase().trim();
    if (subjectMap.has(key) && !countedSubjectSkips.has(key)) {
      countedSubjectSkips.add(key);
    }
  }
  skipped.subjects = countedSubjectSkips.size;

  for (const [, meta] of uniqueSubjects) {
    const id = crypto.randomUUID();
    const name = [...uniqueSubjects.entries()].find(([, v]) => v === meta)?.[0];
    if (!name) continue;
    // Restore proper case from first matching row
    const originalRow = validRows.find((r) => r.subject_name.toLowerCase().trim() === name)!;
    subjectsToInsert.push({
      id,
      name: originalRow.subject_name.trim(),
      description: meta.description ?? null,
      order: meta.order,
    });
    subjectMap.set(name, id);
  }

  if (subjectsToInsert.length > 0) {
    const { error } = await db.from("subjects").insert(subjectsToInsert);
    if (error) return err(`Failed inserting subjects: ${error.message}`, 500);
    created.subjects += subjectsToInsert.length;
  }

  // ── Collect chapters to insert in batch ───────────────────────────────────
  const chaptersToInsert: Array<{
    id: string; name: string; subject_id: string; description: string | null; order: number;
  }> = [];

  const uniqueChapters = new Map<string, { subjectId: string; order: number; description?: string; originalName: string }>();
  const countedChapterSkips = new Set<string>();

  for (const row of validRows) {
    const subjectKey = row.subject_name.toLowerCase().trim();
    const subjectId = subjectMap.get(subjectKey);
    if (!subjectId) continue;

    const chapterKey = `${subjectId}::${row.chapter_name.toLowerCase().trim()}`;
    if (chapterMap.has(chapterKey)) {
      if (!countedChapterSkips.has(chapterKey)) {
        countedChapterSkips.add(chapterKey);
        skipped.chapters++;
      }
    } else if (!uniqueChapters.has(chapterKey)) {
      uniqueChapters.set(chapterKey, {
        subjectId,
        order: row.chapter_order ?? 0,
        description: row.chapter_description,
        originalName: row.chapter_name.trim(),
      });
    }
  }

  for (const [, meta] of uniqueChapters) {
    const id = crypto.randomUUID();
    chaptersToInsert.push({
      id,
      name: meta.originalName,
      subject_id: meta.subjectId,
      description: meta.description ?? null,
      order: meta.order,
    });
    chapterMap.set(`${meta.subjectId}::${meta.originalName.toLowerCase()}`, id);
  }

  if (chaptersToInsert.length > 0) {
    const { error } = await db.from("chapters").insert(chaptersToInsert);
    if (error) return err(`Failed inserting chapters: ${error.message}`, 500);
    created.chapters += chaptersToInsert.length;
  }

  // ── Collect topics to insert in batch ─────────────────────────────────────
  const topicsToInsert: Array<{
    id: string; name: string; chapter_id: string; description: string | null; order: number;
    telegram_url: string | null; telegram_chat_id: string | null;
    telegram_message_id: string | null; youtube_url: string | null;
  }> = [];

  const countedTopicSkips = new Set<string>();

  for (const row of validRows) {
    const subjectId = subjectMap.get(row.subject_name.toLowerCase().trim());
    if (!subjectId) continue;

    const chapterId = chapterMap.get(`${subjectId}::${row.chapter_name.toLowerCase().trim()}`);
    if (!chapterId) continue;

    const topicKey = `${chapterId}::${row.topic_name.toLowerCase().trim()}`;
    if (topicMap.has(topicKey)) {
      if (!countedTopicSkips.has(topicKey)) {
        countedTopicSkips.add(topicKey);
        skipped.topics++;
      }
      continue;
    }
    if (countedTopicSkips.has(topicKey)) continue;
    // Check if already staged
    if (topicsToInsert.some((t) => t.chapter_id === chapterId && t.name.toLowerCase() === row.topic_name.toLowerCase().trim())) {
      continue;
    }

    const id = crypto.randomUUID();
    topicsToInsert.push({
      id,
      name: row.topic_name.trim(),
      chapter_id: chapterId,
      description: row.topic_description ?? null,
      order: row.topic_order ?? 0,
      telegram_url: row.telegram_url ?? null,
      telegram_chat_id: row.telegram_chat_id ?? null,
      telegram_message_id: row.telegram_message_id ?? null,
      youtube_url: row.youtube_url ?? null,
    });
    topicMap.set(topicKey, id);
  }

  if (topicsToInsert.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < topicsToInsert.length; i += BATCH) {
      const { error } = await db.from("topics").insert(topicsToInsert.slice(i, i + BATCH));
      if (error) return err(`Failed inserting topics: ${error.message}`, 500);
    }
    created.topics += topicsToInsert.length;
  }

  return json({
    success: true,
    totalRows: validRows.length,
    created,
    skipped,
  });
});
