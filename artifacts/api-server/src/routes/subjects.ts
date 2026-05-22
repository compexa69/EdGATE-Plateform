import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import {
  CreateSubjectBody,
  UpdateSubjectBody,
  GetSubjectParams,
  UpdateSubjectParams,
  DeleteSubjectParams,
} from "@workspace/api-zod";
import { requireAdmin, requireApproved } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

async function isSubjectTestUnlocked(subjectId: string, userId: string): Promise<boolean> {
  const { data: chapters } = await supabase.from("chapters").select("id").eq("subject_id", subjectId);
  if (!chapters || chapters.length === 0) return false;

  for (const ch of chapters) {
    const { data: chapterExam } = await supabase.from("exams")
      .select("id")
      .eq("chapter_id", ch.id)
      .eq("type", "chapter_test")
      .maybeSingle();
    if (!chapterExam) return false;

    const { data: passedResult } = await supabase.from("exam_results")
      .select("id")
      .eq("exam_id", chapterExam.id)
      .eq("user_id", userId)
      .eq("passed", true)
      .maybeSingle();
    if (!passedResult) return false;
  }
  return true;
}

async function getSubjectTestExamId(subjectId: string): Promise<string | null> {
  const { data: exam } = await supabase.from("exams")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("type", "subject_test")
    .maybeSingle();
  return exam?.id ?? null;
}

async function getSubjectWithProgress(subjectId: string, userId: string) {
  const { data: chapters } = await supabase.from("chapters").select("id").eq("subject_id", subjectId);
  let completedChapters = 0;
  for (const ch of chapters ?? []) {
    const { data: topics } = await supabase.from("topics").select("id").eq("chapter_id", ch.id);
    if (!topics || topics.length === 0) continue;
    let allComplete = true;
    for (const t of topics) {
      const { data: prog } = await supabase.from("topic_progress")
        .select("topic_test_passed")
        .eq("topic_id", t.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!prog?.topic_test_passed) { allComplete = false; break; }
    }
    if (allComplete) completedChapters++;
  }
  return { totalChapters: chapters?.length ?? 0, completedChapters };
}

router.get("/subjects", requireApproved, async (req, res): Promise<void> => {
  const { data: subjects } = await supabase.from("subjects").select("*").order("order");
  const result = await Promise.all((subjects ?? []).map(async (s) => {
    const { totalChapters, completedChapters } = await getSubjectWithProgress(s.id, req.user!.id);
    const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
    const subjectTestUnlocked = await isSubjectTestUnlocked(s.id, req.user!.id);
    const subjectTestExamId = await getSubjectTestExamId(s.id);
    return {
      id: s.id,
      name: s.name,
      description: s.description ?? null,
      order: s.order,
      iconName: s.icon_name ?? null,
      totalChapters,
      completedChapters,
      progressPercent,
      gateStatus: completedChapters === totalChapters && totalChapters > 0 ? "completed" : "unlocked",
      subjectTestUnlocked,
      subjectTestExamId,
      createdAt: s.created_at,
    };
  }));
  res.json(result);
});

router.post("/subjects", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateSubjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { data: subject } = await supabase.from("subjects").insert({
    id: nanoid(),
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    order: parsed.data.order,
    icon_name: (parsed.data as any).iconName ?? null,
  }).select().single();

  res.status(201).json({
    id: subject.id,
    name: subject.name,
    description: subject.description ?? null,
    order: subject.order,
    iconName: subject.icon_name ?? null,
    totalChapters: 0,
    completedChapters: 0,
    progressPercent: 0,
    gateStatus: "unlocked",
    subjectTestUnlocked: false,
    subjectTestExamId: null,
    createdAt: subject.created_at,
  });
});

router.get("/subjects/:subjectId", requireApproved, async (req, res): Promise<void> => {
  const params = GetSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { data: subject } = await supabase.from("subjects").select("*").eq("id", params.data.subjectId).maybeSingle();
  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  const { data: chapters } = await supabase.from("chapters").select("*").eq("subject_id", subject.id).order("order");

  const chaptersWithProgress = await Promise.all((chapters ?? []).map(async (ch) => {
    const { data: topics } = await supabase.from("topics").select("id").eq("chapter_id", ch.id);
    let completedTopics = 0;
    for (const t of topics ?? []) {
      const { data: prog } = await supabase.from("topic_progress")
        .select("topic_test_passed")
        .eq("topic_id", t.id)
        .eq("user_id", req.user!.id)
        .maybeSingle();
      if (prog?.topic_test_passed) completedTopics++;
    }
    const progressPercent = (topics?.length ?? 0) > 0 ? Math.round((completedTopics / topics!.length) * 100) : 0;
    const allComplete = (topics?.length ?? 0) > 0 && completedTopics === topics!.length;

    const { data: chapterExam } = await supabase.from("exams")
      .select("id")
      .eq("chapter_id", ch.id)
      .eq("type", "chapter_test")
      .maybeSingle();
    let chapterTestAttempted = false;
    if (chapterExam) {
      const { data: result } = await supabase.from("exam_results")
        .select("id")
        .eq("exam_id", chapterExam.id)
        .eq("user_id", req.user!.id)
        .maybeSingle();
      chapterTestAttempted = !!result;
    }

    return {
      id: ch.id,
      subjectId: ch.subject_id,
      name: ch.name,
      description: ch.description ?? null,
      order: ch.order,
      totalTopics: topics?.length ?? 0,
      completedTopics,
      progressPercent,
      gateStatus: allComplete ? "completed" : "unlocked",
      chapterTestUnlocked: allComplete,
      notesUploadUnlocked: chapterTestAttempted,
    };
  }));

  const { totalChapters, completedChapters } = await getSubjectWithProgress(subject.id, req.user!.id);
  const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
  const subjectTestUnlocked = await isSubjectTestUnlocked(subject.id, req.user!.id);
  const subjectTestExamId = await getSubjectTestExamId(subject.id);

  res.json({
    id: subject.id,
    name: subject.name,
    description: subject.description ?? null,
    order: subject.order,
    iconName: subject.icon_name ?? null,
    gateStatus: completedChapters === totalChapters && totalChapters > 0 ? "completed" : "unlocked",
    progressPercent,
    subjectTestUnlocked,
    subjectTestExamId,
    chapters: chaptersWithProgress,
  });
});

router.patch("/subjects/:subjectId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSubjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, any> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.description != null) updates.description = parsed.data.description;
  if (parsed.data.order != null) updates.order = parsed.data.order;
  if ((parsed.data as any).iconName != null) updates.icon_name = (parsed.data as any).iconName;

  const { data: subject } = await supabase.from("subjects")
    .update(updates)
    .eq("id", params.data.subjectId)
    .select()
    .maybeSingle();

  if (!subject) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  res.json({
    id: subject.id, name: subject.name, description: subject.description ?? null,
    order: subject.order, iconName: subject.icon_name ?? null,
    totalChapters: 0, completedChapters: 0, progressPercent: 0,
    gateStatus: "unlocked", subjectTestUnlocked: false, subjectTestExamId: null,
    createdAt: subject.created_at,
  });
});

router.delete("/subjects/:subjectId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteSubjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await supabase.from("subjects").delete().eq("id", params.data.subjectId);
  res.sendStatus(204);
});

export default router;
