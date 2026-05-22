import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger";

const B2_APPLICATION_KEY_ID = process.env.B2_APPLICATION_KEY_ID ?? "";
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY ?? "";
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME ?? "edtech-notes";
// B2_ENDPOINT must match your bucket's region, e.g. https://s3.us-west-004.backblazeb2.com
const B2_ENDPOINT = process.env.B2_ENDPOINT ?? "https://s3.us-east-005.backblazeb2.com";

// Extract region slug from endpoint URL (e.g. "us-east-005" from "https://s3.us-east-005.backblazeb2.com")
const B2_REGION = B2_ENDPOINT.replace("https://s3.", "").replace(".backblazeb2.com", "").split("/")[0] ?? "us-east-005";

const s3Client = new S3Client({
  endpoint: B2_ENDPOINT,
  region: B2_REGION,
  credentials: {
    accessKeyId: B2_APPLICATION_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
  forcePathStyle: true,
});

export async function getUploadSignedUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 900 });
}

export async function getDownloadSignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 900 });
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
  } catch (err) {
    logger.error({ err, key }, "Failed to delete B2 object");
  }
}
