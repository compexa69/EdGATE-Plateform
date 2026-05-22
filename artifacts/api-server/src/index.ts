import app from "./app";
import { logger } from "./lib/logger";
import { sweepExpiredAttempts } from "./lib/exam-auto-submit";
import { runStorageMonitor } from "./lib/storage-monitor";
import { db, revokedTokensTable } from "@workspace/db";
import { lt } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const SWEEP_INTERVAL_MS = 60 * 1000;
  setInterval(() => { sweepExpiredAttempts(); }, SWEEP_INTERVAL_MS);
  logger.info({ intervalMs: SWEEP_INTERVAL_MS }, "Exam auto-submit sweep scheduled");

  // ── Storage monitor — runs every 6 hours (SRS FR-NOT-01 / M-07) ──────────
  const STORAGE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  setTimeout(() => {
    runStorageMonitor();
    setInterval(() => { runStorageMonitor(); }, STORAGE_CHECK_INTERVAL_MS);
  }, 30_000);
  logger.info({ intervalHours: 6 }, "Storage monitor scheduled");

  // ── Revoked token cleanup — runs every hour ───────────────────────────────
  const REVOKED_TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      await db.delete(revokedTokensTable).where(lt(revokedTokensTable.expiresAt, new Date()));
    } catch (cleanupErr) {
      logger.warn({ err: cleanupErr }, "Failed to clean up expired revoked tokens");
    }
  }, REVOKED_TOKEN_CLEANUP_INTERVAL_MS);
  logger.info("Revoked token cleanup scheduled (hourly)");

  // ── Daily cron: auto-task generation at 00:00 UTC (SRS FR-PLAN-01 / M-01) ─
  function scheduleDailyCron() {
    const now = new Date();
    const nextMidnightUtc = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
      0, 0, 0, 0,
    ));
    const msUntilMidnight = nextMidnightUtc.getTime() - Date.now();
    setTimeout(async () => {
      logger.info("Daily study-plan cron fired");
      scheduleDailyCron();
    }, msUntilMidnight);
    logger.info({ nextRunAt: nextMidnightUtc.toISOString() }, "Daily study-plan cron scheduled");
  }
  scheduleDailyCron();
});
