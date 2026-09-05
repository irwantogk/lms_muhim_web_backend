import { Elysia, t } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import { authBasePlugin, roleGuard } from "../auth/auth.plugin.ts";
import { createAttendanceRepository } from "./attendance.repo.ts";
import { createAttendanceService } from "./attendance.service.ts";
import {
  attendanceCreateBodySchema,
  createSuccessSchema,
  optionsSuccessSchema,
  scanBodySchema,
  sessionsListSchema,
  successScanSchema,
} from "./attendance.model.ts";

const errorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Array(t.Unknown()),
  }),
});

const attendanceService = createAttendanceService({
  repo: createAttendanceRepository(db),
});

/**
 * Modul Kehadiran (Fase 2) — khusus peran guru:
 *   GET  /attendance/options  -> kelas & mapel yang diampu (untuk form)
 *   GET  /attendance/sessions -> daftar sesi presensi hari ini
 *   POST /attendance/sessions -> buat sesi & kode absen
 */
export const attendanceModule = new Elysia({ prefix: "/attendance" })
  .use(authBasePlugin(JWT_SECRET))
  .get(
    "/options",
    async ({ authUser }) => {
      const data = await attendanceService.optionsForTeacher(authUser!.id);
      return { success: true as const, data: { options: data } };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      response: { 200: optionsSuccessSchema },
      detail: {
        summary: "Opsi kelas & mapel untuk form absensi (RBAC: guru)",
        description: "Mengembalikan pasangan kelas + mata pelajaran yang diampu guru untuk mengisi form buat sesi presensi.",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Opsi berhasil dimuat" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/sessions",
    async ({ authUser }) => {
      const data = await attendanceService.todaySessions(authUser!.id);
      return { success: true as const, data: { sessions: data } };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      response: { 200: sessionsListSchema },
      detail: {
        summary: "Daftar sesi presensi hari ini (RBAC: guru)",
        description: "Mengembalikan sesi absensi yang dibuat guru pada tanggal hari ini beserta kode dan masa berlakunya.",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Daftar sesi berhasil dimuat" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/sessions",
    async ({ body, authUser }) => {
      const data = await attendanceService.createSession({
        teacherId: authUser!.id,
        classId: body.classId,
        subjectId: body.subjectId,
        validMinutes: body.validMinutes,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      body: attendanceCreateBodySchema,
      response: { 200: createSuccessSchema, 403: errorSchema },
      detail: {
        summary: "Buat sesi & kode absensi kelas (RBAC: guru)",
        description:
          "Membuat sesi presensi untuk kelas/mata pelajaran yang diampu guru lalu menerbitkan " +
          "kode sekali pakai beserta waktu kedaluwarsa (default 60 menit, maks 240).",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Sesi & kode berhasil dibuat" },
          "400": { description: "Body tidak valid" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Bukan pengampu kelas/mapel tersebut" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/sessions/:id/close",
    async ({ params, authUser }) => {
      const data = await attendanceService.closeSession(params.id, authUser!.id);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      params: t.Object({
        id: t.String({
          pattern:
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        }),
      }),
      response: { 200: createSuccessSchema, 404: errorSchema },
      detail: {
        summary: "Tutup sesi absensi (RBAC: guru)",
        description:
          "Menghentikan sesi presensi lebih cepat — kode langsung tidak berlaku lagi " +
          "(expires_at diset ke waktu sekarang). Hanya pemilik sesi (guru pembuat) yang dapat menutup.",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Sesi ditutup" },
          "400": { description: "Param tidak valid" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Peran tidak diizinkan" },
          "404": { description: "Sesi tidak ditemukan / bukan milik Anda" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/scan",
    async ({ body, authUser }) => {
      const data = await attendanceService.scan(body.code, authUser!.id);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["murid"]),
      body: scanBodySchema,
      response: {
        200: successScanSchema,
        400: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Catat kehadiran murid via kode (RBAC: murid)",
        description:
          "Menerima kode presensi yang ditampilkan guru, memvalidasi masa berlaku dan " +
          "keanggotaan murid di kelas sesi, lalu mencatat kehadiran berstatus hadir.",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Kehadiran tercatat" },
          "400": { description: "Kode tidak valid / kedaluwarsa" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Murid tidak terdaftar di kelas sesi / peran salah" },
          "404": { description: "Kode presensi tidak ditemukan" },
          "409": { description: "Sudah tercatat hadir pada sesi ini" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );
