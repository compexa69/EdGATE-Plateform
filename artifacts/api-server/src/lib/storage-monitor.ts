import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { sendStorageAlertEmail } from "./email";
import { logger } from "./logger";
import { supabase } from "./supabase";

const B2_APPLICATION_KEY_ID = process.env.B2_APPLICATION_KEY_ID ?? "";
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY ?? "";
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME ?? "edtech-notes";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";

const ALERT_THRESHOLD_GB = 8;
const LIMIT_GB = 10;

let lastAlertSentAt: number | null = null;
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function runStorageMonitor(): Promise<void> {
  if (!B2_APPLICATION_KEY_ID || !B2_APPLICATION_KEY) {
    logger.debug("B2 credentials not configured — skipping storage monitor");
    return;
  }

  try {
    const s3 = new S3Client({
      endpoint: B2_ENDPOINT,
      region: "us-east-005",
      credentials: {
        accessKeyId: B2_APPLICATION_KEY_ID,
        secretAccessKey: B2_APPLICATION_KEY,
      },
    });

    let totalBytes = 0;
    let continuationToken: string | undefined;

    do {
      const cmd = new ListObjectsV2Command({
        Bucket: B2_BUCKET_NAME,
        ContinuationToken: continuationToken,
      });
      const response = await s3.send(cmd);
      for (const obj of response.Contents ?? []) {
        totalBytes += obj.Size ?? 0;
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    const usedGB = totalBytes / (1024 ** 3);
    logger.info({ usedGB: usedGB.toFixed(3), limitGB: LIMIT_GB }, "B2 storage check");

    if (usedGB >= ALERT_THRESHOLD_GB) {
      const now = Date.now();
      if (lastAlertSentAt && now - lastAlertSentAt < ALERT_COOLDOWN_MS) {
        logger.debug("Storage alert cooldown active — skipping email");
        return;
      }

      const { data: admins } = await supabase.from("users")
        .select("email")
        .eq("role", "super_admin");

      for (const admin of admins ?? []) {
        await sendStorageAlertEmail(admin.email, usedGB, LIMIT_GB);
      }
      lastAlertSentAt = now;
      logger.warn({ usedGB: usedGB.toFixed(3), threshold: ALERT_THRESHOLD_GB }, "Storage alert sent to admins");
    }
  } catch (err) {
    logger.error({ err }, "Storage monitor failed");
  }
}
