import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { roleSchema } from "./auth.model.ts";

export const meProfileSchema = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.Union([t.String(), t.Null()]),
  nisn: t.Union([t.String(), t.Null()]),
  role: roleSchema,
  isActive: t.Boolean(),
  photoUrl: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

export const updateMeBodySchema = t.Object({
  fullName: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  photoUrl: t.Optional(
    t.Union([
      t.String({ maxLength: 512 }),
      t.Literal(""),
      t.Null(),
    ]),
  ),
});

export const changePasswordBodySchema = t.Object({
  currentPassword: t.String({ minLength: 1, maxLength: 200 }),
  newPassword: t.String({ minLength: 6, maxLength: 200 }),
});

export const photoPresignBodySchema = t.Object({
  fileName: t.String({ minLength: 1, maxLength: 255 }),
  fileSize: t.Integer({ minimum: 1, maximum: 5 * 1024 * 1024 }),
});

export const photoPresignResultSchema = t.Object({
  key: t.String(),
  method: t.Literal("PUT"),
  uploadUrl: t.String(),
  fileUrl: t.String(),
});

export const successMeSchema = t.Object({
  success: t.Literal(true),
  data: meProfileSchema,
});

export const successPasswordSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({ ok: t.Literal(true) }),
});

export const successPhotoPresignSchema = t.Object({
  success: t.Literal(true),
  data: photoPresignResultSchema,
});

export type MeProfile = Static<typeof meProfileSchema>;
export type PhotoPresignResult = Static<typeof photoPresignResultSchema>;
