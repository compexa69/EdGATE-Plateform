import { handleCors, json, err } from "../_shared/cors.ts";
import { requireAuth, adminClient } from "../_shared/auth.ts";

interface QuestionInput {
  text: string;
  options?: string[];
  option1?: string; option2?: string; option3?: string; option4?: string;
  correct_option: string | number;
  marks?: number;
  difficulty?: string;
  topic_id?: string;
  topic_name?: string;
  subject_name?: string;
  chapter_name?: string;
  text_solution?: string;
  image_url?: string;
  video_url?: string;
}

interface ResultRow {
  row: number;
  status: "imported" | "failed";
  question?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") return err("Method not allowed", 405);

  const actor = await requireAuth(req);
  if (!actor) return err("Unauthorized", 401);
  if (!["admin", "super_admin", "content_manager"].includes(actor.role)) {
    return err("Forbidden — admins only", 403);
  }

  let body: { questions?: QuestionInput[] };
  try { body = await req.json(); } catch { return err("Invalid JSON body"); }

  const inputs: QuestionInput[] = body.questions ?? [];
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return err("questions array is required and must not be empty");
  }
  if (inputs.length > 500) return err("Max 500 questions per import");

  const db = adminClient();

  // ── Resolve topic names → IDs in one batch query ──────────────────────────
  const topicNames = [...new Set(
    inputs.filter((q) => q.topic_name && !q.topic_id).map((q) => q.topic_name!.trim())
  )];

  const topicNameMap = new Map<string, string[]>(); // name.lower → [id, ...]

  if (topicNames.length > 0) {
    const { data: topics } = await db
      .from("topics")
      .select("id, name, chapter_id");

    const { data: chapters } = await db
      .from("chapters")
      .select("id, name, subject_id");

    const { data: subjects } = await db
      .from("subjects")
      .select("id, name");

    const chapterMap = new Map((chapters ?? []).map((c: { id: string; name: string; subject_id: string }) => [c.id, c]));
    const subjectMap = new Map((subjects ?? []).map((s: { id: string; name: string }) => [s.id, s]));

    for (const t of topics ?? []) {
      const key = t.name.toLowerCase().trim();
      if (!topicNameMap.has(key)) topicNameMap.set(key, []);
      topicNameMap.get(key)!.push(t.id);
    }

    // Store enriched topic data for disambiguation
    const topicDetails = new Map<string, Array<{
      id: string; name: string; chapter_name: string; subject_name: string;
    }>>();

    for (const t of topics ?? []) {
      const key = t.name.toLowerCase().trim();
      const ch = chapterMap.get(t.chapter_id);
      const sub = ch ? subjectMap.get(ch.subject_id) : null;
      if (!topicDetails.has(key)) topicDetails.set(key, []);
      topicDetails.get(key)!.push({
        id: t.id,
        name: t.name,
        chapter_name: ch?.name ?? "",
        subject_name: sub?.name ?? "",
      });
    }

    // Replace topicNameMap with disambiguated data
    topicNameMap.clear();
    for (const [key, details] of topicDetails) {
      topicNameMap.set(key, details.map((d) => d.id));
    }

    // For questions that also supply subject_name/chapter_name, do finer resolution
    // stored separately for per-question resolution
    (globalThis as any).__topicDetails = topicDetails;
  }

  const topicDetails: Map<string, Array<{
    id: string; chapter_name: string; subject_name: string;
  }>> = (globalThis as any).__topicDetails ?? new Map();

  // ── Process each question ─────────────────────────────────────────────────
  const toInsert: Array<{
    id: string; text: string; options: string[]; correct_option: string;
    marks: number; difficulty: string; topic_id: string | null;
    text_solution: string | null; image_url: string | null; video_url: string | null;
  }> = [];

  const rows: ResultRow[] = [];
  let failed = 0;

  for (let i = 0; i < inputs.length; i++) {
    const q = inputs[i];
    const rowNum = i + 1;
    const preview = (q.text ?? "").slice(0, 60);

    // ── Validation ─────────────────────────────────────────────────────────
    const errors: string[] = [];

    if (!q.text?.trim()) errors.push("text is required");

    // Normalise options
    const opts: string[] = Array.isArray(q.options)
      ? q.options.slice(0, 4)
      : [q.option1 ?? "", q.option2 ?? "", q.option3 ?? "", q.option4 ?? ""];

    if (opts.length < 4 || opts.some((o) => !o.trim())) {
      errors.push("4 non-empty options are required");
    }

    const co = typeof q.correct_option === "number"
      ? q.correct_option
      : parseInt(String(q.correct_option), 10);
    if (isNaN(co) || co < 0 || co > 3) errors.push("correct_option must be 0–3");

    const marks = q.marks ?? 4;
    if (typeof marks !== "number" || marks <= 0) errors.push("marks must be a positive number");

    const difficulty = (q.difficulty ?? "medium").toLowerCase();
    if (!["easy", "medium", "hard"].includes(difficulty)) {
      errors.push("difficulty must be easy, medium, or hard");
    }

    // ── Topic resolution ───────────────────────────────────────────────────
    let resolvedTopicId: string | null = q.topic_id?.trim() || null;

    if (!resolvedTopicId && q.topic_name?.trim()) {
      const key = q.topic_name.trim().toLowerCase();
      const candidates = topicDetails.get(key) ?? [];

      if (candidates.length === 0) {
        errors.push(`topic_name "${q.topic_name}" not found`);
      } else if (candidates.length === 1) {
        resolvedTopicId = candidates[0].id;
      } else {
        // Disambiguate
        const sn = q.subject_name?.trim().toLowerCase() ?? "";
        const cn = q.chapter_name?.trim().toLowerCase() ?? "";

        const match = candidates.find((c) =>
          (!sn || c.subject_name.toLowerCase() === sn) &&
          (!cn || c.chapter_name.toLowerCase() === cn)
        );

        if (match) {
          resolvedTopicId = match.id;
        } else if (sn || cn) {
          errors.push(
            `topic_name "${q.topic_name}" exists in multiple chapters — specify subject_name and/or chapter_name to disambiguate`
          );
        } else {
          // Use first match if no disambiguation provided
          resolvedTopicId = candidates[0].id;
        }
      }
    }

    if (errors.length > 0) {
      rows.push({ row: rowNum, status: "failed", question: preview, error: errors.join("; ") });
      failed++;
      continue;
    }

    toInsert.push({
      id: crypto.randomUUID(),
      text: q.text!.trim(),
      options: opts.map((o) => o.trim()),
      correct_option: String(co),
      marks,
      difficulty,
      topic_id: resolvedTopicId,
      text_solution: q.text_solution?.trim() || null,
      image_url: q.image_url?.trim() || null,
      video_url: q.video_url?.trim() || null,
    });

    rows.push({ row: rowNum, status: "imported", question: preview });
  }

  // ── Batch insert all valid questions ──────────────────────────────────────
  if (toInsert.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error } = await db.from("questions").insert(toInsert.slice(i, i + BATCH));
      if (error) {
        // Mark this batch as failed
        const batchStart = i;
        const batchEnd = Math.min(i + BATCH, toInsert.length);
        for (let j = batchStart; j < batchEnd; j++) {
          const rowEntry = rows.find((r) => r.status === "imported" && r.row === j + 1 - failed);
          if (rowEntry) { rowEntry.status = "failed"; rowEntry.error = error.message; failed++; }
        }
      }
    }
  }

  const imported = inputs.length - failed;

  return json({
    imported,
    failed,
    total: inputs.length,
    rows,
  });
});
