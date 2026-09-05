import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  PRESIGN_TTL_SECONDS,
  S3_ACCESS_KEY,
  S3_BUCKET,
  S3_ENDPOINT,
  S3_REGION,
  S3_SECRET_KEY,
} from "../common/env.ts";

let client: S3Client | null = null;

export function s3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
    });
  }
  return client;
}

/** Pastikan bucket tersedia (dibuat otomatis bila belum ada). */
export async function ensureBucket(): Promise<void> {
  const s3 = s3Client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  }
}

function randomKey(ext: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}.${ext}`;
}

export interface PresignedPut {
  key: string;
  uploadUrl: string;
  fileUrl: string;
}

/** Buat key objek & presigned PUT URL untuk unggah oleh client. */
export async function presignPutUpload(
  ext: string,
  _contentType?: string,
): Promise<PresignedPut> {
  const key = randomKey(ext);
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  const uploadUrl = await getSignedUrl(s3Client(), command, {
    expiresIn: PRESIGN_TTL_SECONDS,
  });
  return { key, uploadUrl, fileUrl: `/uploads/${key}` };
}

export interface StoredObject {
  key: string;
  contentType?: string;
  contentLength?: number;
  body: ReadableStream<Uint8Array>;
}

export async function fetchObject(
  key: string,
): Promise<StoredObject | null> {
  const s3 = s3Client();
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    );
    if (!result.Body) return null;
    const body = result.Body as unknown as ReadableStream<Uint8Array>;
    return {
      key,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      body,
    };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}
