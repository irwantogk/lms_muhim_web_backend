import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";

export const materialTypeSchema = t.Union([
  t.Literal("pdf"),
  t.Literal("video"),
  t.Literal("dokumen"),
  t.Literal("catatan"),
]);

export const materialItemSchema = t.Object({
  id: t.String(),
  className: t.String(),
  classId: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  teacherName: t.String(),
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  content: t.Union([t.String(), t.Null()]),
  fileUrl: t.String(),
  type: materialTypeSchema,
  createdAt: t.String(),
});

/** Minta presigned URL (upload dilakukan langsung oleh client ke S3/MinIO). */
export const presignUploadBodySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
  subjectId: t.String({ pattern: uuidPattern }),
  fileName: t.String({ minLength: 1, maxLength: 160 }),
  fileSize: t.Integer({ minimum: 1, maximum: 314572800 }),
  title: t.Optional(t.String({ maxLength: 160 })),
  description: t.Optional(t.String({ maxLength: 500 })),
});

/** Catat metadata materi setelah objek berhasil di-upload ke S3. */
export const createMaterialBodySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
  subjectId: t.String({ pattern: uuidPattern }),
  key: t.String({
    minLength: 5,
    maxLength: 120,
    description: "Kunci objek dari respons presign (hex.ext)",
  }),
  title: t.Optional(t.String({ maxLength: 160 })),
  description: t.Optional(t.String({ maxLength: 500 })),
});

export const createContentBodySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
  subjectId: t.String({ pattern: uuidPattern }),
  title: t.String({ minLength: 1, maxLength: 160 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  content: t.String({ minLength: 1 }),
});

export const materialByIdParamsSchema = t.Object({
  id: t.String({ pattern: uuidPattern }),
});

export const successCreateContentSchema = t.Object({
  success: t.Literal(true),
  data: materialItemSchema,
});

export const successMaterialDetailSchema = t.Object({
  success: t.Literal(true),
  data: materialItemSchema,
});

export const listMaterialsQuerySchema = t.Object({
  classId: t.Optional(
    t.String({ pattern: uuidPattern, description: "ID kelas (opsional)" }),
  ),
  subjectId: t.Optional(
    t.String({ pattern: uuidPattern, description: "Filter ID mapel (opsional)" }),
  ),
  type: t.Optional(
    t.Union([
      t.Literal("pdf"),
      t.Literal("video"),
      t.Literal("dokumen"),
      t.Literal("catatan"),
    ]),
  ),
  q: t.Optional(t.String({ maxLength: 100, description: "Kata kunci pencarian" })),
});

export const presignResultSchema = t.Object({
  key: t.String(),
  method: t.Literal("PUT"),
  uploadUrl: t.String(),
  fileUrl: t.String(),
  type: materialTypeSchema,
});

export const successPresignSchema = t.Object({
  success: t.Literal(true),
  data: presignResultSchema,
});

export const successCreateMaterialSchema = t.Object({
  success: t.Literal(true),
  data: materialItemSchema,
});

export const successListMaterialsSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    availableClasses: t.Array(
      t.Object({ id: t.String(), name: t.String() }),
    ),
    currentClassId: t.Union([t.String(), t.Null()]),
    materials: t.Array(materialItemSchema),
  }),
});

export type MaterialItem = Static<typeof materialItemSchema>;
export type PresignResult = Static<typeof presignResultSchema>;
