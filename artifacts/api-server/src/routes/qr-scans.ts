import { Router, type IRouter } from "express";
import { nanoid } from "nanoid";
import { requireApproved } from "../lib/auth";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

router.post("/qr-scans", requireApproved, async (req, res): Promise<void> => {
  const { questionId, examId, resultId } = req.body as {
    questionId: string;
    examId?: string | null;
    resultId?: string | null;
  };

  if (!questionId) {
    res.status(400).json({ error: "questionId is required" });
    return;
  }

  const { data: question } = await supabase.from("questions").select("id").eq("id", questionId).maybeSingle();
  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const { data: log } = await supabase.from("qr_scan_logs").insert({
    id: nanoid(),
    user_id: req.user!.id,
    question_id: questionId,
    exam_id: examId ?? null,
    result_id: resultId ?? null,
  }).select().single();

  res.status(201).json({ id: log.id, scannedAt: log.scanned_at });
});

router.get("/qr-scans", requireApproved, async (req, res): Promise<void> => {
  const { data: logs } = await supabase.from("qr_scan_logs")
    .select("*")
    .eq("user_id", req.user!.id)
    .order("scanned_at", { ascending: false })
    .limit(200);

  if (!logs || logs.length === 0) {
    res.json([]);
    return;
  }

  const questionIds = [...new Set(logs.map((l) => l.question_id))];
  const { data: questions } = await supabase.from("questions")
    .select("id, text, topic_id, video_url")
    .in("id", questionIds);
  const questionMap = new Map((questions ?? []).map((q) => [q.id, q]));

  const examIds = [...new Set(logs.filter((l) => l.exam_id).map((l) => l.exam_id!))];
  const exams = examIds.length > 0
    ? (await supabase.from("exams").select("id, title").in("id", examIds)).data ?? []
    : [];
  const examMap = new Map(exams.map((e) => [e.id, e]));

  const topicIds = [...new Set((questions ?? []).filter((q) => q.topic_id).map((q) => q.topic_id!))];
  const topics = topicIds.length > 0
    ? (await supabase.from("topics").select("id, name").in("id", topicIds)).data ?? []
    : [];
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  res.json(logs.map((log) => {
    const q = questionMap.get(log.question_id);
    const exam = log.exam_id ? examMap.get(log.exam_id) : null;
    const topic = q?.topic_id ? topicMap.get(q.topic_id) : null;
    return {
      id: log.id,
      questionId: log.question_id,
      questionText: q?.text ?? "Unknown question",
      videoUrl: q?.video_url ?? null,
      examId: log.exam_id ?? null,
      examTitle: exam?.title ?? null,
      resultId: log.result_id ?? null,
      topicId: q?.topic_id ?? null,
      topicName: topic?.name ?? null,
      scannedAt: log.scanned_at,
    };
  }));
});

export default router;
