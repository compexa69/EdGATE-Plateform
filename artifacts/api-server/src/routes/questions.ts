import { Router, type IRouter } from "express";
import { db, questionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import multer from "multer";
import { parse } from "csv-parse/sync";
import QRCode from "qrcode";
import {
  ListQuestionsQueryParams,
  CreateQuestionBody,
  UpdateQuestionParams,
  UpdateQuestionBody,
  DeleteQuestionParams,
} from "@workspace/api-zod";
import { requireApproved, requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

async function generateQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const VALID_DIFFICULTIES = ["easy", "medium", "hard"] as const;

function formatQuestion(q: typeof questionsTable.$inferSelect) {
  return {
    id: q.id, text: q.text, options: q.options,
    correctOption: parseInt(q.correctOption, 10),
    marks: q.marks, topicId: q.topicId ?? null,
    textSolution: q.textSolution ?? null,
    videoUrl: q.videoUrl ?? null, qrCodeSvg: q.qrCodeSvg ?? null,
    difficulty: q.difficulty,
  };
}

router.get("/questions", requireApproved, async (req, res): Promise<void> => {
  const params = ListQuestionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let query = db.select().from(questionsTable).$dynamic();
  if (params.data.topicId) {
    query = query.where(eq(questionsTable.topicId, params.data.topicId));
  }

  const questions = await query;
  res.json(questions.map(formatQuestion));
});

router.post("/questions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [q] = await db.insert(questionsTable).values({
    id: nanoid(),
    ...parsed.data,
    correctOption: String(parsed.data.correctOption),
  }).returning();

  res.status(201).json(formatQuestion(q));
});

router.post(
  "/questions/import",
  requireAdmin,
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No CSV file uploaded" });
      return;
    }

    let rawRows: Record<string, string>[];
    try {
      rawRows = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Record<string, string>[];
    } catch (err) {
      res.status(400).json({ error: "Failed to parse CSV. Ensure it is a valid UTF-8 CSV file." });
      return;
    }

    if (rawRows.length === 0) {
      res.status(400).json({ error: "CSV file is empty" });
      return;
    }

    if (rawRows.length > 500) {
      res.status(400).json({ error: "Too many rows. Maximum 500 questions per import." });
      return;
    }

    const results: Array<{
      row: number;
      status: "imported" | "failed";
      question?: string;
      error?: string;
    }> = [];

    let importedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2;

      const text = row["text"]?.trim();
      const option1 = row["option1"]?.trim();
      const option2 = row["option2"]?.trim();
      const option3 = row["option3"]?.trim();
      const option4 = row["option4"]?.trim();
      const correctOptionRaw = row["correct_option"]?.trim();
      const marksRaw = row["marks"]?.trim();
      const difficultyRaw = row["difficulty"]?.trim().toLowerCase();
      const topicId = row["topic_id"]?.trim() || null;
      const textSolution = row["text_solution"]?.trim() || null;

      if (!text) {
        results.push({ row: rowNum, status: "failed", error: "Missing question text" });
        failedCount++;
        continue;
      }
      if (!option1 || !option2 || !option3 || !option4) {
        results.push({ row: rowNum, status: "failed", question: text.slice(0, 60), error: "All 4 options are required" });
        failedCount++;
        continue;
      }

      const correctOption = parseInt(correctOptionRaw ?? "", 10);
      if (isNaN(correctOption) || correctOption < 0 || correctOption > 3) {
        results.push({ row: rowNum, status: "failed", question: text.slice(0, 60), error: "correct_option must be 0, 1, 2, or 3" });
        failedCount++;
        continue;
      }

      const marks = marksRaw ? parseFloat(marksRaw) : 4;
      if (isNaN(marks) || marks <= 0) {
        results.push({ row: rowNum, status: "failed", question: text.slice(0, 60), error: "marks must be a positive number" });
        failedCount++;
        continue;
      }

      const difficulty = (VALID_DIFFICULTIES as readonly string[]).includes(difficultyRaw ?? "")
        ? (difficultyRaw as "easy" | "medium" | "hard")
        : "medium";

      try {
        await db.insert(questionsTable).values({
          id: nanoid(),
          text,
          options: [option1, option2, option3, option4],
          correctOption: String(correctOption),
          marks,
          difficulty,
          topicId: topicId || null,
          textSolution: textSolution || null,
        });
        results.push({ row: rowNum, status: "imported", question: text.slice(0, 60) });
        importedCount++;
      } catch (err) {
        logger.error({ err, rowNum }, "Failed to insert question from CSV");
        results.push({ row: rowNum, status: "failed", question: text.slice(0, 60), error: "Database insert failed" });
        failedCount++;
      }
    }

    res.status(200).json({ imported: importedCount, failed: failedCount, total: rawRows.length, rows: results });
  }
);

router.patch("/questions/:questionId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateQuestionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.correctOption != null) updates.correctOption = String(parsed.data.correctOption);

  // Auto-generate QR code SVG when videoUrl is set or cleared
  if (parsed.data.videoUrl) {
    try {
      updates.qrCodeSvg = await generateQrSvg(parsed.data.videoUrl);
    } catch (err) {
      logger.warn({ err }, "Failed to generate QR code SVG");
    }
  } else if ("videoUrl" in parsed.data) {
    // videoUrl explicitly set to null/empty — clear QR too
    updates.qrCodeSvg = null;
  }

  const [q] = await db.update(questionsTable)
    .set(updates)
    .where(eq(questionsTable.id, params.data.questionId))
    .returning();

  if (!q) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  res.json(formatQuestion(q));
});

router.delete("/questions/:questionId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteQuestionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(questionsTable).where(eq(questionsTable.id, params.data.questionId));
  res.sendStatus(204);
});

export default router;
