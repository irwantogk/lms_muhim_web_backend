import { Elysia } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import { authBasePlugin, roleGuard } from "../auth/auth.plugin.ts";
import { createHistoryStore } from "./attendance.history.repo.ts";
import {
  getParentHistory,
  getSchoolHistory,
  getStudentHistory,
  getTeacherHistory,
} from "./attendance.history.service.ts";
import {
  historyQuerySchema,
  successParentHistorySchema,
  successSchoolHistorySchema,
  successStudentHistorySchema,
  successTeacherHistorySchema,
} from "./attendance.history.model.ts";

const store = createHistoryStore(db);

function daysOf(query: { days?: number }): number | undefined {
  return query.days;
}

/**
 * Riwayat kehadiran sesuai peran:
 *   /attendance/history/murid     -> riwayat pribadi murid
 *   /attendance/history/orang-tua -> riwayat anak (bisa pilih ?studentId=)
 *   /attendance/history/guru      -> sesi absensi yang pernah dibuat guru
 *   /attendance/history/admin     -> rekap kehadiran sekolah per hari
 */
export const attendanceHistoryModule = new Elysia({ prefix: "/attendance/history" })
  .use(authBasePlugin(JWT_SECRET))
  .get(
    "/murid",
    async ({ query, authUser }) => {
      const data = await getStudentHistory(store, authUser!.id, {
        days: daysOf(query),
      });
      return { success: true as const, data: { ...data, scope: "murid" } };
    },
    {
      beforeHandle: roleGuard(["murid"]),
      query: historyQuerySchema,
      response: { 200: successStudentHistorySchema },
      detail: {
        summary: "Riwayat kehadiran murid (RBAC: murid)",
        description: "Riwayat presensi milik murid sendiri beserta ringkasan statistik dalam rentang hari (default 30).",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Riwayat dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "404": { description: "Murid tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/orang-tua",
    async ({ query, authUser }) => {
      const data = await getParentHistory(store, authUser!.id, {
        days: daysOf(query),
        studentId: query.studentId,
      });
      return { success: true as const, data: { ...data, scope: "orang_tua" } };
    },
    {
      beforeHandle: roleGuard(["orang_tua"]),
      query: historyQuerySchema,
      response: { 200: successParentHistorySchema },
      detail: {
        summary: "Riwayat kehadiran anak (RBAC: orang tua)",
        description: "Riwayat kehadiran anak yang terhubung; tanpa studentId memakai anak pertama. Ringkasan per anak juga disertakan.",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Riwayat dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan anak yang terhubung / peran salah" },
          "404": { description: "Tidak ada anak terhubung" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/guru",
    async ({ query, authUser }) => {
      const data = await getTeacherHistory(store, authUser!.id, {
        days: daysOf(query),
      });
      return { success: true as const, data: { ...data, scope: "guru" } };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      query: historyQuerySchema,
      response: { 200: successTeacherHistorySchema },
      detail: {
        summary: "Riwayat sesi absensi guru (RBAC: guru)",
        description: "Daftar sesi presensi yang pernah dibuat guru beserta jumlah murid per status dalam rentang hari (default 30).",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Riwayat sesi dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/admin",
    async ({ query }) => {
      const data = await getSchoolHistory(store, { days: daysOf(query) });
      return { success: true as const, data: { ...data, scope: "admin" } };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: historyQuerySchema,
      response: { 200: successSchoolHistorySchema },
      detail: {
        summary: "Rekap kehadiran sekolah per hari (RBAC: admin)",
        description: "Rekap jumlah hadir/terlambat/izin/sakit seluruh sekolah per tanggal dalam rentang hari (default 30).",
        tags: ["Attendance"],
        responses: {
          "200": { description: "Rekap dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );
