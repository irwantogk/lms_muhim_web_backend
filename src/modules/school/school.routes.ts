import { Elysia, t } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import { authBasePlugin, roleGuard } from "../auth/auth.plugin.ts";
import { createSchoolStore } from "./school.repo.ts";
import { createSchoolService } from "./school.service.ts";
import {
  addStudentBodySchema,
  addTeacherBodySchema,
  changeTeacherBodySchema,
  classIdQuerySchema,
  createClassBodySchema,
  createSubjectBodySchema,
  createUserBodySchema,
  idParamsSchema,
  listUsersQuerySchema,
  moveStudentBodySchema,
  removeStudentQuerySchema,
  successClassItemSchema,
  successClassListSchema,
  successDeleteSchema,
  successOkSchema,
  successStudentMembershipSchema,
  successSubjectItemSchema,
  successSubjectListSchema,
  successTeacherMembershipSchema,
  successUserItemSchema,
  successUserListSchema,
  updateClassBodySchema,
  updateSubjectBodySchema,
  updateUserBodySchema,
} from "./school.model.ts";

const errorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Array(t.Unknown()),
  }),
});

const service = createSchoolService({ repo: createSchoolStore(db) });

/**
 * Kelola data sekolah (RBAC: admin):
 *   GET/POST/PATCH/DELETE /kelola/classes  -> kelas
 *   GET/POST/PATCH/DELETE /kelola/subjects -> mata pelajaran
 */
export const schoolModule = new Elysia({ prefix: "/kelola" })
  .use(authBasePlugin(JWT_SECRET))
  .get(
    "/users",
    async ({ query }) => {
      const isActive = query.status === "aktif"
        ? true
        : query.status === "nonaktif"
        ? false
        : undefined;
      const limit = query.limit ?? 25;
      const offset = query.offset ?? 0;
      const data = await service.listUsers(
        {
          role: query.role,
          q: query.q,
          isActive,
        },
        { limit, offset },
      );
      return {
        success: true as const,
        data: { ...data, limit, offset },
      };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: listUsersQuerySchema,
      response: {
        200: successUserListSchema,
        401: errorSchema,
        403: errorSchema,
      },
      detail: {
        summary: "Daftar pengguna (RBAC: admin)",
        description:
          "Pengguna guru/murid/orang tua (dan admin). Filter opsional `role`, `q` (cari nama/email), `status=aktif|nonaktif`, serta `limit` & `offset` untuk paginasi.",
        tags: ["Kelola Sekolah"],
        responses: {
          "200": { description: "Daftar pengguna dimuat (paginasi)" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan admin" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/users/:id",
    async ({ params }) => {
      const data = await service.getUser(params.id);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      params: idParamsSchema,
      response: {
        200: successUserItemSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Detail pengguna (RBAC: admin)",
        description: "Mengambil satu pengguna berdasarkan id (untuk formulir edit).",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .post(
    "/users",
    async ({ body }) => {
      const data = await service.createUser(body);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      body: createUserBodySchema,
      response: {
        200: successUserItemSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Tambah pengguna (RBAC: admin)",
        description: "Membuat akun guru, murid, atau orang tua dengan kata sandi.",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .patch(
    "/users/:id",
    async ({ params, body }) => {
      const data = await service.updateUser(params.id, body);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      params: idParamsSchema,
      body: updateUserBodySchema,
      response: {
        200: successUserItemSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Ubah / nonaktifkan pengguna (RBAC: admin)",
        description:
          "Mengubah nama, email, peran, kata sandi (opsional), atau status aktif akun.",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .get(
    "/membership/students",
    async ({ query }) => {
      const data = await service.getStudentMembership(query.classId);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: classIdQuerySchema,
      response: {
        200: successStudentMembershipSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Keanggotaan murid di kelas (RBAC: admin)",
        description: "Daftar murid yang sudah di kelas & murid (tanpa kelas) yang dapat dimasukkan.",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .post(
    "/membership/students",
    async ({ body }) => {
      await service.addStudentMembership(body.classId, body.studentId);
      return { success: true as const, data: { ok: true as const } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      body: addStudentBodySchema,
      response: {
        200: successOkSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Masukkan murid ke kelas (RBAC: admin)",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .post(
    "/membership/students/move",
    async ({ body }) => {
      await service.moveStudentMembership(body.studentId, body.classId);
      return { success: true as const, data: { ok: true as const } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      body: moveStudentBodySchema,
      response: {
        200: successOkSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Pindahkan murid ke kelas lain (RBAC: admin)",
        description:
          "Memindahkan keanggotaan murid dari kelas sekarang ke kelas tujuan (mis. naik kelas / koreksi penetapan). Data nilai & riwayat tidak dihapus.",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .delete(
    "/membership/students",
    async ({ query }) => {
      await service.removeStudentMembership(query.classId, query.studentId);
      return { success: true as const, data: { ok: true as const } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: removeStudentQuerySchema,
      response: {
        200: successOkSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Keluarkan murid dari kelas (RBAC: admin)",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .get(
    "/membership/teachers",
    async ({ query }) => {
      const data = await service.getTeacherMembership(query.classId);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: classIdQuerySchema,
      response: {
        200: successTeacherMembershipSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Guru pengampu mapel per kelas (RBAC: admin)",
        description: "Daftar penugasan guru untuk tiap mapel di kelas, mapel yang belum punya guru, dan pilihan guru.",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .post(
    "/membership/teachers",
    async ({ body }) => {
      await service.addTeacherAssignment(
        body.classId,
        body.subjectId,
        body.teacherId,
      );
      return { success: true as const, data: { ok: true as const } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      body: addTeacherBodySchema,
      response: {
        200: successOkSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Tetapkan guru pengampu mapel di kelas (RBAC: admin)",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .patch(
    "/membership/teachers/:id",
    async ({ params, body }) => {
      await service.changeTeacher(params.id, body.teacherId);
      return { success: true as const, data: { ok: true as const } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      params: idParamsSchema,
      body: changeTeacherBodySchema,
      response: {
        200: successOkSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Ganti guru pengampu (RBAC: admin)",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .delete(
    "/membership/teachers/:id",
    async ({ params }) => {
      await service.removeTeacherAssignment(params.id);
      return { success: true as const, data: { ok: true as const } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      params: idParamsSchema,
      response: {
        200: successOkSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Hapus penugasan guru (RBAC: admin)",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .get(
    "/classes",
    async () => {
      const data = await service.listClasses();
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      response: { 200: successClassListSchema, 401: errorSchema, 403: errorSchema },
      detail: {
        summary: "Daftar kelas (RBAC: admin)",
        description: "Semua kelas beserta jumlah murid & jumlah mapel yang diampu di kelas tersebut.",
        tags: ["Kelola Sekolah"],
        responses: {
          "200": { description: "Daftar kelas dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan admin" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/classes",
    async ({ body }) => {
      const data = await service.createClass(body);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      body: createClassBodySchema,
      response: {
        200: successClassItemSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Tambah kelas (RBAC: admin)",
        description: "Membuat kelas baru. Nama kelas harus unik.",
        tags: ["Kelola Sekolah"],
        responses: {
          "200": { description: "Kelas dibuat" },
          "409": { description: "Nama kelas sudah dipakai" },
        },
      },
    },
  )
  .patch(
    "/classes/:id",
    async ({ params, body }) => {
      const data = await service.updateClass(params.id, body);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      params: idParamsSchema,
      body: updateClassBodySchema,
      response: {
        200: successClassItemSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Ubah kelas (RBAC: admin)",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .delete(
    "/classes/:id",
    async ({ params }) => {
      await service.deleteClass(params.id);
      return { success: true as const, data: { id: params.id } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      params: idParamsSchema,
      response: {
        200: successDeleteSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Hapus kelas (RBAC: admin)",
        description: "Menghapus kelas bila belum dipakai (murid, guru, jadwal, dsb.).",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .get(
    "/subjects",
    async () => {
      const data = await service.listSubjects();
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      response: { 200: successSubjectListSchema, 401: errorSchema, 403: errorSchema },
      detail: {
        summary: "Daftar mata pelajaran (RBAC: admin)",
        description: "Semua mata pelajaran beserta jumlah kelas yang menggunakannya.",
        tags: ["Kelola Sekolah"],
        responses: {
          "200": { description: "Daftar mapel dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan admin" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/subjects",
    async ({ body }) => {
      const data = await service.createSubject(body);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      body: createSubjectBodySchema,
      response: {
        200: successSubjectItemSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Tambah mata pelajaran (RBAC: admin)",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .patch(
    "/subjects/:id",
    async ({ params, body }) => {
      const data = await service.updateSubject(params.id, body);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      params: idParamsSchema,
      body: updateSubjectBodySchema,
      response: {
        200: successSubjectItemSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Ubah mata pelajaran (RBAC: admin)",
        tags: ["Kelola Sekolah"],
      },
    },
  )
  .delete(
    "/subjects/:id",
    async ({ params }) => {
      await service.deleteSubject(params.id);
      return { success: true as const, data: { id: params.id } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      params: idParamsSchema,
      response: {
        200: successDeleteSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Hapus mata pelajaran (RBAC: admin)",
        description: "Menghapus mapel bila belum dipakai (guru pengampu, jadwal, tugas, dsb.).",
        tags: ["Kelola Sekolah"],
      },
    },
  );
