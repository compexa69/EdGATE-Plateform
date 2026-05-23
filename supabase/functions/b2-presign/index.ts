import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";
import { handleCors, json, err } from "../_shared/cors.ts";
import { requireApproved } from "../_shared/auth.ts";

const B2_KEY_ID = Deno.env.get("B2_APPLICATION_KEY_ID") ?? "";
const B2_APP_KEY = Deno.env.get("B2_APPLICATION_KEY") ?? "";
const B2_BUCKET = Deno.env.get("B2_BUCKET_NAME") ?? "edtech-notes";
const B2_ENDPOINT = Deno.env.get("B2_ENDPOINT") ?? "https://s3.us-east-005.backblazeb2.com";
const B2_REGION = B2_ENDPOINT.replace("https://s3.", "").replace(".backblazeb2.com", "").split("/")[0] ?? "us-east-005";

const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: B2_REGION,
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
  forcePathStyle: true,
});

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") return err("Method not allowed", 405);

  const user = await requireApproved(req);
  if (!user) return err("Unauthorized", 401);

  let body: { action: string; key?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { action, key, contentType } = body;

  if (!action) return err("action is required");
  if (!key) return err("key is required");

  if (!/^[a-zA-Z0-9/_.\-]+$/.test(key)) {
    return err("Invalid key — only alphanumeric, /, _, ., - allowed");
  }

  try {
    if (action === "upload") {
      if (!contentType) return err("contentType is required for upload");
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!allowedTypes.includes(contentType)) {
        return err(`Unsupported contentType. Allowed: ${allowedTypes.join(", ")}`);
      }

      const command = new PutObjectCommand({
        Bucket: B2_BUCKET,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(s3, command, { expiresIn: 900 });
      return json({ url, expiresIn: 900 });
    }

    if (action === "download") {
      const command = new GetObjectCommand({ Bucket: B2_BUCKET, Key: key });
      const url = await getSignedUrl(s3, command, { expiresIn: 900 });
      return json({ url, expiresIn: 900 });
    }

    if (action === "delete") {
      if (user.role !== "admin" && user.role !== "super_admin") {
        return err("Only admins can delete files", 403);
      }
      await s3.send(new DeleteObjectCommand({ Bucket: B2_BUCKET, Key: key }));
      return json({ success: true });
    }

    return err(`Unknown action: ${action}. Use upload | download | delete`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[b2-presign] error:", message);
    return err(`B2 operation failed: ${message}`, 500);
  }
});
