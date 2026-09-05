import { Elysia, t } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import {
  authBasePlugin,
  requireAccessToken,
  roleGuard,
} from "../auth/auth.plugin.ts";
import { createMaterialsStore } from "../materials/materials.repo.ts";
import { createForumStore } from "./forum.repo.ts";
import { createForumService } from "./forum.service.ts";
import {
  createForumReplyBodySchema,
  createForumTopicBodySchema,
  forumReplyIdParamsSchema,
  forumTopicIdParamsSchema,
  forumMetaSchema,
  listForumTopicsQuerySchema,
  moderationHiddenBodySchema,
  successCreateForumReplySchema,
  successCreateForumTopicSchema,
  successForumMetaSchema,
  successForumTopicDetailSchema,
  successListForumTopicsSchema,
  successModerationMessageSchema,
} from "./forum.model.ts";

const tErrorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Array(t.Unknown()),
  }),
});

const forumService = createForumService({
  repo: createForumStore(db),
  scope: createMaterialsStore(db),
});

const guruModeration = {
  summary: "Moderasi postingan forum (RBAC: guru pengampu)",
  tags: ["Forum"],
  responses: {
    "200": { description: "Aksi moderasi berhasil" },
    "400": { description: "Data tidak valid" },
    "401": { description: "Token tidak valid / tidak disertakan" },
    "403": { description: "Bukan guru / bukan pengampu kelas-mapel" },
    "404": { description: "Postingan tidak ditemukan" },
    "500": { description: "Kesalahan server" },
  },
};

export const forumModule = new Elysia({ prefix: "/forum" })
  .use(authBasePlugin(JWT_SECRET))
    .get(
    "/meta",
    async ({ authUser }) => {
      const data = await forumService.meta({
        role: authUser!.role,
        userId: authUser!.id,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: requireAccessToken(),
      response: { 200: successForumMetaSchema },
      detail: {
        summary: "Meta forum: kelas sesuai peran & daftar mapel",
        description:
          "Untuk mengisi form topik baru: kelas yang dapat diakses peran pengguna beserta " +
          "seluruh mata pelajaran.",
        tags: ["Forum"],
        responses: {
          "200": { description: "Meta dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/topics",
    async ({ body, authUser }) => {
      const data = await forumService.createTopic({
        role: authUser!.role,
        userId: authUser!.id,
        classId: body.classId,
        subjectId: body.subjectId,
        title: body.title,
        body: body.body,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru", "murid"]),
      body: createForumTopicBodySchema,
      response: { 200: successCreateForumTopicSchema, 400: tErrorSchema, 403: tErrorSchema },
      detail: {
        summary: "Tambah topik forum (RBAC: guru & murid, cek keanggotaan)",
        description:
          "Membuat topik baru. Murid hanya untuk kelasnya; guru hanya untuk kelas & mapel yang " +
          "diampunya. Admin/orang tua tidak dapat menulis topik.",
        tags: ["Forum"],
        responses: {
          "200": { description: "Topik berhasil dibuat" },
          "400": { description: "Data tidak valid" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan anggota kelas / bukan pengampu / peran salah" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/topics/:id/replies",
    async ({ params, body, authUser }) => {
      const data = await forumService.replyTopic({
        role: authUser!.role,
        userId: authUser!.id,
        topicId: params.id,
        body: body.body,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru", "murid"]),
      params: forumTopicIdParamsSchema,
      body: createForumReplyBodySchema,
      response: { 200: successCreateForumReplySchema, 400: tErrorSchema, 403: tErrorSchema, 404: tErrorSchema },
      detail: {
        summary: "Balas topik forum (RBAC: guru & murid, cek keanggotaan)",
        description:
          "Membalas topik. Murid hanya untuk topik di kelasnya (dan tidak disembunyikan); guru " +
          "hanya untuk topik kelas/mapel yang diampu.",
        tags: ["Forum"],
        responses: {
          "200": { description: "Balasan berhasil dibuat" },
          "400": { description: "Isi balasan tidak valid" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan anggota kelas / bukan pengampu / peran salah" },
          "404": { description: "Topik tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/topics/:id/hidden",
    async ({ params, body, authUser }) => {
      const data = await forumService.hideOrShowTopic({
        teacherId: authUser!.id,
        topicId: params.id,
        hidden: body.hidden,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      params: forumTopicIdParamsSchema,
      body: moderationHiddenBodySchema,
      response: { 200: successCreateForumTopicSchema, 400: tErrorSchema, 403: tErrorSchema, 404: tErrorSchema },
      detail: {
        summary: "Sembunyikan/tampilkan topik (RBAC: guru)",
        description:
          "Mengubah `is_hidden` topik. Hanya guru pengampu kelas & mapel topik tersebut.",
        tags: ["Forum"],
        responses: {
          "200": { description: "Topik diperbarui" },
          "400": { description: "Data tidak valid" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu kelas-mapel" },
          "404": { description: "Topik tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .delete(
    "/topics/:id",
    async ({ params, authUser }) => {
      await forumService.deleteTopicAction({
        teacherId: authUser!.id,
        topicId: params.id,
      });
      return { success: true as const, data: { message: "Topik dihapus" } };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      params: forumTopicIdParamsSchema,
      response: { 200: successModerationMessageSchema, 403: tErrorSchema, 404: tErrorSchema },
      detail: {
        summary: "Hapus topik (RBAC: guru)",
        description:
          "Menghapus topik beserta seluruh balasannya (cascade). Hanya guru pengampu kelas & mapel tsb.",
        tags: ["Forum"],
        responses: {
          "200": { description: "Topik dihapus" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu kelas-mapel" },
          "404": { description: "Topik tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/replies/:id/hidden",
    async ({ params, body, authUser }) => {
      const data = await forumService.hideOrShowReply({
        teacherId: authUser!.id,
        replyId: params.id,
        hidden: body.hidden,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      params: forumReplyIdParamsSchema,
      body: moderationHiddenBodySchema,
      response: { 200: successCreateForumReplySchema, 400: tErrorSchema, 403: tErrorSchema, 404: tErrorSchema },
      detail: {
        summary: "Sembunyikan/tampilkan balasan (RBAC: guru)",
        description:
          "Mengubah `is_hidden` balasan. Hanya guru pengampu topik tempat balasan berada.",
        tags: ["Forum"],
        responses: {
          "200": { description: "Balasan diperbarui" },
          "400": { description: "Data tidak valid" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu kelas-mapel" },
          "404": { description: "Balasan tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .delete(
    "/replies/:id",
    async ({ params, authUser }) => {
      await forumService.deleteReplyAction({
        teacherId: authUser!.id,
        replyId: params.id,
      });
      return { success: true as const, data: { message: "Balasan dihapus" } };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      params: forumReplyIdParamsSchema,
      response: { 200: successModerationMessageSchema, 403: tErrorSchema, 404: tErrorSchema },
      detail: {
        ...guruModeration,
        summary: "Hapus balasan (RBAC: guru)",
        description:
          "Menghapus balasan. Hanya guru pengampu topik tempat balasan berada.",
      },
    },
  )
  .get(
    "/topics",
    async ({ query, authUser }) => {
      const data = await forumService.listTopics({
        role: authUser!.role,
        userId: authUser!.id,
        classId: query.classId,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: requireAccessToken(),
      query: listForumTopicsQuerySchema,
      response: { 200: successListForumTopicsSchema },
      detail: {
        summary: "Daftar topik forum sesuai hak akses",
        description:
          "Mengembalikan topik diskusi sesuai peran: murid (kelasnya), guru (kelas diampu, " +
          "termasuk yang disembunyikan untuk moderasi), orang tua (kelas anak), admin (semua). " +
          "Filter opsional `classId`.",
        tags: ["Forum"],
        responses: {
          "200": { description: "Daftar topik dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/topics/:id",
    async ({ params, authUser }) => {
      const data = await forumService.detailTopic({
        role: authUser!.role,
        userId: authUser!.id,
        id: params.id,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: requireAccessToken(),
      params: forumTopicIdParamsSchema,
      response: { 200: successForumTopicDetailSchema, 403: tErrorSchema, 404: tErrorSchema },
      detail: {
        summary: "Detail topik beserta balasan sesuai hak akses",
        description:
          "Mengembalikan satu topik beserta balasannya. Hanya untuk kelas yang dapat diakses " +
          "peran pengguna; guru dapat melihat topik/balasan yang disembunyikan.",
        tags: ["Forum"],
        responses: {
          "200": { description: "Detail topik dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Tidak berhak mengakses topik" },
          "404": { description: "Topik tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );
