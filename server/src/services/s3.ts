import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../config/env.js";

export function createS3Client(env: Env) {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    // Default WHEN_SUPPORTED adds CRC32 to presigned PUT URLs; browsers often cannot
    // reproduce that and the cross-origin request surfaces as "Failed to fetch".
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export async function presignPutObject(
  client: S3Client,
  env: Env,
  key: string,
  contentType: string,
  expiresInSeconds = 600
) {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export function buildPlaybackUrl(env: Env, s3Key: string) {
  const base = env.CDN_PUBLIC_BASE_URL.replace(/\/$/, "");
  const path = s3Key.startsWith("/") ? s3Key.slice(1) : s3Key;
  return `${base}/${path}`;
}
