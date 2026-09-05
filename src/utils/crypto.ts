import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { DATA_KEY } from "../common/env.ts";

const KEY = Buffer.from(DATA_KEY.padEnd(32, "x").slice(0, 32), "utf8");
const ALGO = "aes-256-gcm";
const IV_LEN = 12;

/** Normalisasi email untuk konsistensi lookup & keunikan. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Normalisasi NISN (10 digit). */
export function normalizeNisn(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Hash deterministik (HMAC-SHA256) dari nilai ternormalisasi.
 * Dipakai untuk lookup login & pengecekan keunikan (bukan untuk dibaca ulang).
 */
export function identityHash(value: string): string {
  return createHmac("sha256", KEY).update(value).digest("hex");
}

/** Enkripsi AES-256-GCM -> "iv.tag.ciphertext" (base64). */
export function aesEncrypt(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

/** Dekripsi AES-256-GCM dari format "iv.tag.ciphertext". */
export function aesDecrypt(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Payload terenkripsi tidak valid");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Samarkan email, contoh "ra***@domain.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local[0] ?? "";
  return `${head}${"*".repeat(Math.max(2, local.length - 1))}${domain}`;
}

/** Samarkan NISN, contoh "630********89". */
export function maskNisn(nisn: string): string {
  if (nisn.length <= 5) return "•••";
  return `${nisn.slice(0, 3)}${"*".repeat(nisn.length - 5)}${nisn.slice(-2)}`;
}
