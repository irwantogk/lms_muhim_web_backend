import { Elysia, t } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import { authBasePlugin, requireAccessToken, roleGuard } from "../auth/auth.plugin.ts";
import { createMaterialsStore } from "./materials.repo.ts";
import { createMaterialsService } from "./materials.service.ts";
import { fetchObject, presignPutUpload } from "../../utils/s3.ts";
import {
  createContentBodySchema,
  createMaterialBodySchema,
  listMaterialsQuerySchema,
  materialByIdParamsSchema,
  presignUploadBodySchema,
  successCreateContentSchema,
  successCreateMaterialSchema,
  successListMaterialsSchema,
  successMaterialDetailSchema,
  successPresignSchema,
} from "./materials.model.ts";

const errorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Array(t.Unknown()),
  }),
});

const materialsService = createMaterialsService({
  repo: createMaterialsStore(db),
  presign: (ext, contentType) => presignPutUpload(ext, contentType),
});

const KEY_PATTERN = /^[0-9a-f]{32}\.[a-z0-9]{2,8}$/;

const CONTENT_TYPE_MAP: Record<string, string> = {
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain;charset=utf-8",
};

/** Menyajikan berkas yang tersimpan di bucket S3/MinIO. */
export const uploadsModule = new Elysia().get("/uploads/:name", async ({ params }) => {
  const key = params.name;
  if (!KEY_PATTERN.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  let object;
  try {
    object = await fetchObject(key);
  } catch (error) {
    console.error("[s3-fetch]", error);
    return new Response("Penyimpanan tidak tersedia", { status: 502 });
  }
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const ext = key.split(".").pop() ?? "bin";
  const contentType = CONTENT_TYPE_MAP[ext] ??
    object.contentType ??
    "application/octet-stream";
  const disposition = ext === "pdf" ? "inline" : "attachment";

  return new Response(object.body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `${disposition}; filename="${key}"`,
      ...(object.contentLength
        ? { "content-length": String(object.contentLength) }
        : {}),
    },
  });
});

/**
 * Modul materi — unggah dibebankan ke client via presigned URL:
 *   1. POST /materials/presign-upload -> dapatkan presigned PUT URL
 *   2. client meng-upload bytes ke uploadUrl (S3/MinIO)
 *   3. POST /materials -> catat metadata materi
 */
export const materialsModule = new Elysia({ prefix: "/materials" })
  .use(authBasePlugin(JWT_SECRET))
  .post(
    "/presign-upload",
    async ({ body, authUser }) => {
      const data = await materialsService.prepareUpload({
        teacherId: authUser!.id,
        classId: body.classId,
        subjectId: body.subjectId,
        fileName: body.fileName,
        fileSize: body.fileSize,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      body: presignUploadBodySchema,
      response: { 200: successPresignSchema, 400: errorSchema, 403: errorSchema },
      detail: {
        summary: "Siapkan presigned URL upload materi (RBAC: guru)",
        description:
          "Memvalidasi nama & ukuran file serta kepemilikan kelas/mapel, lalu menerbitkan " +
          "presigned PUT URL S3/MinIO. Client meng-upload bytes langsung ke URL ini.",
        tags: ["Materials"],
        responses: {
          "200": { description: "Presigned URL diterbitkan" },
          "400": { description: "File tidak valid / melebihi batas" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu kelas/mapel / peran salah" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/",
    async ({ query, authUser }) => {
      const data = await materialsService.listMaterials({
        role: authUser!.role,
        userId: authUser!.id,
        classId: query.classId,
        subjectId: query.subjectId,
        type: query.type,
        q: query.q,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: requireAccessToken(),
      query: listMaterialsQuerySchema,
      response: { 200: successListMaterialsSchema },
      detail: {
        summary: "Daftar materi sesuai peran & filter",
        description:
          "Mengembalikan pustaka materi sesuai peran (murid: kelasnya, guru: kelas diampu, orang tua: " +
          "kelas anak, admin: semua) dengan filter `classId`, `subjectId`, `type`, dan pencarian `q`.",
        tags: ["Materials"],
        responses: {
          "200": { description: "Daftar materi dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/",
    async ({ body, authUser }) => {
      const data = await materialsService.confirmMaterial({
        teacherId: authUser!.id,
        classId: body.classId,
        subjectId: body.subjectId,
        key: body.key,
        title: body.title,
        description: body.description,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      body: createMaterialBodySchema,
      response: { 200: successCreateMaterialSchema, 400: errorSchema, 403: errorSchema },
      detail: {
        summary: "Catat metadata materi setelah unggah (RBAC: guru)",
        description:
          "Diterima setelah client sukses meng-upload objek ke presigned URL. Validasi kunci " +
          "objek lalu menyimpan metadata ke tabel materials.",
        tags: ["Materials"],
        responses: {
          "200": { description: "Materi tercatat" },
          "400": { description: "Kunci objek tidak valid" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu kelas/mapel / peran salah" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/content",
    async ({ body, authUser }) => {
      const data = await materialsService.createContent({
        teacherId: authUser!.id,
        classId: body.classId,
        subjectId: body.subjectId,
        title: body.title,
        description: body.description,
        content: body.content,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      body: createContentBodySchema,
      response: {
        200: successCreateContentSchema,
        400: errorSchema,
        403: errorSchema,
      },
      detail: {
        summary: "Buat materi teks langsung (RBAC: guru)",
        description:
          "Menyimpan materi yang ditulis langsung (konten HTML) tanpa unggah berkas. " +
          "Tipe materi menjadi `catatan` dan konten tersimpan di kolom content.",
        tags: ["Materials"],
        responses: {
          "200": { description: "Materi teks tersimpan" },
          "400": { description: "Judul/isi kosong atau body tidak valid" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu kelas/mapel / peran salah" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/:id",
    async ({ params, authUser }) => {
      const data = await materialsService.materialDetail({
        role: authUser!.role,
        userId: authUser!.id,
        id: params.id,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: requireAccessToken(),
      params: materialByIdParamsSchema,
      response: { 200: successMaterialDetailSchema, 403: errorSchema },
      detail: {
        summary: "Detail materi (termasuk konten catatan)",
        description:
          "Mengambil satu materi (beserta konten untuk tipe catatan). Hanya untuk kelas yang " +
          "terjangkau peran pengguna.",
        tags: ["Materials"],
        responses: {
          "200": { description: "Detail materi dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Tidak berhak / materi tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );
