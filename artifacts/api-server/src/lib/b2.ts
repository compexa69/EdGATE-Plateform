import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger";

const B2_ACCOUNT_ID = process.env.B2_ACCOUNT_ID ?? "";
const B2_APPLICATION_KEY_ID = process.env.B2_APPLICATION_KEY_ID ?? "";
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY ?? "";
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME ?? "";
const B2_ENDPOINT = `https://s3.us-east-005.backblazeb2.com`;

const s3Client = new S3Client({
  endpoint: B2_ENDPOINT,
  region: "us-east-005",
  credentials: {
    accessKeyId: B2_APPLICATION_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
  },
});

export async function getUploadSignedUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function getDownloadSignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
  } catch (err) {
    logger.error({ err, key }, "Failed to delete B2 object");
  }
}
