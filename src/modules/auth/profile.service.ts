import type { ProfileRow, ProfileStore } from "./profile.store.ts";
import type { MeProfile, PhotoPresignResult } from "./profile.model.ts";
import { NotFoundError, ValidationError } from "../../utils/errors.ts";
import { aesDecrypt, maskEmail, maskNisn } from "../../utils/crypto.ts";

function maskedOf(encrypted: string | null, mask: (v: string) => string): string | null {
  if (!encrypted) return null;
  try {
    return mask(aesDecrypt(encrypted));
  } catch {
    return null;
  }
}

export type PasswordVerifier = (password: string, hash: string) => Promise<boolean>;
export type PasswordHasher = (password: string) => Promise<string>;

export interface PhotoPresigner {
  presign(ext: string): Promise<{
    key: string;
    uploadUrl: string;
    fileUrl: string;
  }>;
}

export interface ProfileServiceDeps {
  store: ProfileStore;
  verify: PasswordVerifier;
  hash: PasswordHasher;
  photo: PhotoPresigner;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function toProfile(row: ProfileRow): MeProfile {
  return {
    id: row.id,
    name: row.fullName,
    email: maskedOf(row.email, maskEmail),
    nisn: maskedOf(row.nisn, maskNisn),
    role: row.role,
    isActive: row.isActive,
    photoUrl: row.photoUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireProfile(
  store: ProfileStore,
  userId: string,
): Promise<ProfileRow> {
  const row = await store.byId(userId);
  if (!row) throw new NotFoundError("Pengguna tidak ditemukan");
  return row;
}

export async function getMe(
  deps: ProfileServiceDeps,
  userId: string,
): Promise<MeProfile> {
  return toProfile(await requireProfile(deps.store, userId));
}

export async function updateMe(
  deps: ProfileServiceDeps,
  userId: string,
  input: { fullName?: string; photoUrl?: string | null },
): Promise<MeProfile> {
  await requireProfile(deps.store, userId);
  const patch: { fullName?: string; photoUrl?: string | null } = {};
  if (input.fullName !== undefined) {
    const name = input.fullName.trim();
    if (!name) throw new ValidationError("Nama tidak boleh kosong");
    patch.fullName = name;
  }
  if (input.photoUrl !== undefined) {
    // String kosong dianggap menghapus foto.
    patch.photoUrl = input.photoUrl === "" ? null : input.photoUrl;
  }
  await deps.store.updateProfile(userId, patch);
  return toProfile(await requireProfile(deps.store, userId));
}

export async function changePassword(
  deps: ProfileServiceDeps,
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ ok: true }> {
  const profile = await requireProfile(deps.store, userId);
  const valid = await deps.verify(input.currentPassword, profile.passwordHash);
  if (!valid) {
    throw new ValidationError("Kata sandi lama tidak sesuai");
  }
  if (input.newPassword === input.currentPassword) {
    throw new ValidationError(
      "Kata sandi baru tidak boleh sama dengan kata sandi lama",
    );
  }
  const nextHash = await deps.hash(input.newPassword);
  await deps.store.setPassword(userId, nextHash);
  return { ok: true };
}

export async function preparePhotoUpload(
  deps: ProfileServiceDeps,
  input: { fileName: string; fileSize: number },
): Promise<PhotoPresignResult> {
  const dot = input.fileName.lastIndexOf(".");
  const ext = dot === -1
    ? ""
    : input.fileName.slice(dot + 1).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    throw new ValidationError(
      "Jenis berkas tidak didukung. Gunakan PNG, JPG, WEBP, atau GIF.",
    );
  }
  if (input.fileSize > 5 * 1024 * 1024) {
    throw new ValidationError("Foto maksimal 5 MB");
  }
  const result = await deps.photo.presign(ext);
  return {
    key: result.key,
    method: "PUT",
    uploadUrl: result.uploadUrl,
    fileUrl: result.fileUrl,
  };
}
