export const JWT_SECRET = process.env["JWT_SECRET"] ??
  "lms-dev-secret-change-me";

/** Kunci enkripsi data sensitif (min. 32 karakter; produksi: gunakan nilai acak rahasia). */
export const DATA_KEY = process.env["DATA_KEY"] ??
  "lms-dev-data-key-0123456789abcdef";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Masa berlaku refresh token (7–30 hari sesuai kebutuhan). */
export const REFRESH_TOKEN_TTL_DAYS = Number(
  process.env["REFRESH_TOKEN_TTL_DAYS"] ?? 30,
);

// ---------------------------------------------------------------------------
// Penyimpanan file (S3-compatible, upload via presigned URL)
// ---------------------------------------------------------------------------
export const S3_ENDPOINT = process.env["S3_ENDPOINT"] ?? "http://localhost:9000";
export const S3_REGION = process.env["S3_REGION"] ?? "us-east-1";
export const S3_ACCESS_KEY = process.env["S3_ACCESS_KEY"] ?? "minioadmin";
export const S3_SECRET_KEY = process.env["S3_SECRET_KEY"] ?? "minioadmin";
export const S3_BUCKET = process.env["S3_BUCKET"] ?? "lms-files";

/** Masa berlaku presigned URL (detik). */
export const PRESIGN_TTL_SECONDS = Number(
  process.env["PRESIGN_TTL_SECONDS"] ?? 900,
);

/** Batas ukuran video (MB). */
export const MAX_VIDEO_MB = Number(process.env["MAX_VIDEO_MB"] ?? 200);

/** Batas ukuran file non-video: PDF & dokumen (MB). */
export const MAX_FILE_MB = Number(process.env["MAX_FILE_MB"] ?? 20);
