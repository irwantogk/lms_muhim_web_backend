import { Elysia, t } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import { authBasePlugin, roleGuard } from "../auth/auth.plugin.ts";
import { createAssignmentsStore } from "../assignments/assignments.repo.ts";
import { createHistoryStore } from "../attendance/attendance.history.repo.ts";
import { createReportsStore } from "./reports.repo.ts";
import {
  getAdminRekap,
  getAdminRekapSiswa,
  getGuruRekap,
  getGuruRekapSiswa,
  getMuridProgress,
  getOrtuPantauan,
  getOrtuProgress,
  rekapAbsenToCsv,
  rekapNilaiToCsv,
  rekapSiswaAbsenToCsv,
  rekapSiswaNilaiToCsv,
  type RekapData,
  type RekapSiswaData,
  type ReportsServiceDeps,
} from "./reports.service.ts";
import {
  ortuProgressQuerySchema,
  progressQuerySchema,
  rekapCsvQuerySchema,
  rekapQuerySchema,
  successAdminRekapSchema,
  successAdminRekapSiswaSchema,
  successGuruRekapSchema,
  successGuruRekapSiswaSchema,
  successMuridProgressSchema,
  successOrtuProgressSchema,
  successPantauanOrtuSchema,
} from "./reports.model.ts";

const errorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Array(t.Unknown()),
  }),
});

const deps: ReportsServiceDeps = {
  reports: createReportsStore(db),
  assignments: createAssignmentsStore(db),
  history: createHistoryStore(db),
};

type RekapJenis = "nilai" | "kehadiran";

function csvResponse(csv: string, filename: string): Response {
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function buildCsvResponse(
  data: RekapData,
  jenis: RekapJenis,
  scope: "guru" | "admin",
): Response {
  const csv = jenis === "kehadiran"
    ? rekapAbsenToCsv(data)
    : rekapNilaiToCsv(data);
  return csvResponse(csv, `rekap-${jenis}-${scope}.csv`);
}

function buildSiswaCsvResponse(
  data: RekapSiswaData,
  jenis: RekapJenis,
  scope: "guru" | "admin",
): Response {
  const csv = jenis === "kehadiran"
    ? rekapSiswaAbsenToCsv(data)
    : rekapSiswaNilaiToCsv(data);
  return csvResponse(csv, `rekap-siswa-${jenis}-${scope}.csv`);
}

/**
 * Laporan & Progres belajar sesuai peran:
 *   GET /reports/progress/murid     -> progres belajar murid sendiri
 *   GET /reports/progress/orang-tua -> progres belajar anak (orang tua)
 *   GET /reports/rekap/guru         -> rekap nilai & kehadiran kelas diampu guru
 *   GET /reports/rekap/admin        -> rekap nilai & kehadiran seluruh sekolah
 */
export const reportsModule = new Elysia({ prefix: "/reports" })
  .use(authBasePlugin(JWT_SECRET))
  .get(
    "/progress/murid",
    async ({ query, authUser }) => {
      const data = await getMuridProgress(deps, authUser!.id, {
        days: query.days,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["murid"]),
      query: progressQuerySchema,
      response: {
        200: successMuridProgressSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Progres belajar murid (RBAC: murid)",
        description:
          "Progres belajar milik murid sendiri: ringkasan nilai & penyelesaian tugas per mapel, " +
          "riwayat nilai terbaru, dan rekap kehadiran dalam rentang hari (default 30).",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "Progres belajar dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "404": { description: "Murid tidak ditemukan / belum di kelas" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/progress/orang-tua",
    async ({ query, authUser }) => {
      const data = await getOrtuProgress(deps, authUser!.id, {
        days: query.days,
        studentId: query.studentId,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["orang_tua"]),
      query: ortuProgressQuerySchema,
      response: {
        200: successOrtuProgressSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Progres belajar anak (RBAC: orang tua)",
        description:
          "Progres belajar anak yang terhubung: daftar anak, anak terpilih, ringkasan nilai & tugas " +
          "per mapel, serta rekap kehadiran. Tanpa `studentId` memakai anak pertama.",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "Progres belajar anak dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan anak yang terhubung / peran salah" },
          "404": { description: "Tidak ada anak terhubung" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/pantauan/orang-tua",
    async ({ query, authUser }) => {
      const data = await getOrtuPantauan(deps, authUser!.id, {
        days: query.days,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["orang_tua"]),
      query: progressQuerySchema,
      response: {
        200: successPantauanOrtuSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Pantauan anak (rangkuman semua anak) (RBAC: orang tua)",
        description:
          "Rangkuman pantauan untuk setiap anak: kehadiran hari ini & dalam rentang periode, " +
          "ringkasan nilai/tugas, progres per mapel, serta riwayat nilai & kehadiran terbaru. " +
          "Param `days` untuk lebar periode kehadiran (default 30).",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "Pantauan dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "404": { description: "Tidak ada anak terhubung" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/rekap/guru",
    async ({ query, authUser }) => {
      const data = await getGuruRekap(deps, authUser!.id, {
        days: query.days,
        classId: query.classId,
        subjectCode: query.subjectCode,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      query: rekapQuerySchema,
      response: {
        200: successGuruRekapSchema,
        401: errorSchema,
        403: errorSchema,
      },
      detail: {
        summary: "Rekap nilai & kehadiran kelas diampu (RBAC: guru)",
        description:
          "Agregasi per kelas & mata pelajaran yang guru ampu: jumlah tugas, tugas dinilai, rata-rata / " +
          "tertinggi / terendah nilai, serta rekap kehadiran (hadir/terlambat/izin/sakit) dalam rentang " +
          "hari (default 30). Filter opsional `classId` dan `subjectCode`.",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "Rekap dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/rekap/admin",
    async ({ query }) => {
      const data = await getAdminRekap(deps, {
        days: query.days,
        classId: query.classId,
        subjectCode: query.subjectCode,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: rekapQuerySchema,
      response: {
        200: successAdminRekapSchema,
        401: errorSchema,
        403: errorSchema,
      },
      detail: {
        summary: "Rekap nilai & kehadiran seluruh sekolah (RBAC: admin)",
        description:
          "Agregasi per kelas & mata pelajaran untuk seluruh kelas di sekolah. Filter opsional " +
          "`classId` dan `subjectCode`.",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "Rekap dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/rekap/guru/csv",
    async ({ query, authUser }) => {
      const data = await getGuruRekap(deps, authUser!.id, {
        days: query.days,
        classId: query.classId,
        subjectCode: query.subjectCode,
      });
      const jenis: RekapJenis = query.jenis === "kehadiran" ? "kehadiran" : "nilai";
      return buildCsvResponse(data, jenis, "guru");
    },
    {
      beforeHandle: roleGuard(["guru"]),
      query: rekapCsvQuerySchema,
      detail: {
        summary: "Unduh rekap sebagai CSV (RBAC: guru)",
        description:
          "Mengunduh rekap nilai atau kehadiran kelas yang diampu dalam format CSV " +
          "(`?jenis=nilai` default, `?jenis=kehadiran`). Filter `classId`, `subjectCode`, `days` sama seperti endpoint JSON.",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "File CSV diunduh" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/rekap/admin/csv",
    async ({ query }) => {
      const data = await getAdminRekap(deps, {
        days: query.days,
        classId: query.classId,
        subjectCode: query.subjectCode,
      });
      const jenis: RekapJenis = query.jenis === "kehadiran" ? "kehadiran" : "nilai";
      return buildCsvResponse(data, jenis, "admin");
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: rekapCsvQuerySchema,
      detail: {
        summary: "Unduh rekap sekolah sebagai CSV (RBAC: admin)",
        description:
          "Mengunduh rekap nilai atau kehadiran seluruh kelas dalam format CSV " +
          "(`?jenis=nilai` default, `?jenis=kehadiran`).",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "File CSV diunduh" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/rekap/guru/siswa",
    async ({ query, authUser }) => {
      const data = await getGuruRekapSiswa(deps, authUser!.id, {
        days: query.days,
        classId: query.classId,
        subjectCode: query.subjectCode,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      query: rekapQuerySchema,
      response: {
        200: successGuruRekapSiswaSchema,
        401: errorSchema,
        403: errorSchema,
      },
      detail: {
        summary: "Rekap nilai & absen per siswa (RBAC: guru)",
        description:
          "Rekap per siswa di kelas yang diampu: nilai per mapel (tugas, dinilai, rata-rata) dan " +
          "ringkasan kehadiran dalam rentang hari (default 30). Filter opsional `classId`, `subjectCode`, `days`.",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "Rekap per siswa dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/rekap/guru/siswa/csv",
    async ({ query, authUser }) => {
      const data = await getGuruRekapSiswa(deps, authUser!.id, {
        days: query.days,
        classId: query.classId,
        subjectCode: query.subjectCode,
      });
      const jenis: RekapJenis = query.jenis === "kehadiran" ? "kehadiran" : "nilai";
      return buildSiswaCsvResponse(data, jenis, "guru");
    },
    {
      beforeHandle: roleGuard(["guru"]),
      query: rekapCsvQuerySchema,
      detail: {
        summary: "Unduh rekap per siswa sebagai CSV (RBAC: guru)",
        description:
          "Unduh rekap per siswa (nilai per mapel atau rekap kehadiran) dalam format CSV. " +
          "Filter `classId`, `subjectCode`, `days` sama seperti endpoint JSON.",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "File CSV diunduh" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/rekap/admin/siswa/csv",
    async ({ query }) => {
      const data = await getAdminRekapSiswa(deps, {
        days: query.days,
        classId: query.classId,
        subjectCode: query.subjectCode,
      });
      const jenis: RekapJenis = query.jenis === "kehadiran" ? "kehadiran" : "nilai";
      return buildSiswaCsvResponse(data, jenis, "admin");
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: rekapCsvQuerySchema,
      detail: {
        summary: "Unduh rekap per siswa seluruh sekolah sebagai CSV (RBAC: admin)",
        description:
          "Unduh rekap per siswa seluruh kelas dalam format CSV. Filter `classId`, `subjectCode`, `days`.",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "File CSV diunduh" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/rekap/admin/siswa",
    async ({ query }) => {
      const data = await getAdminRekapSiswa(deps, {
        days: query.days,
        classId: query.classId,
        subjectCode: query.subjectCode,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      query: rekapQuerySchema,
      response: {
        200: successAdminRekapSiswaSchema,
        401: errorSchema,
        403: errorSchema,
      },
      detail: {
        summary: "Rekap nilai & absen per siswa seluruh sekolah (RBAC: admin)",
        description:
          "Rekap per siswa di seluruh kelas: nilai per mapel dan ringkasan kehadiran. Filter " +
          "opsional `classId`, `subjectCode`, `days`.",
        tags: ["Laporan & Progres"],
        responses: {
          "200": { description: "Rekap per siswa dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );

