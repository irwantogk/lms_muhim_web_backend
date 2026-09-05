import { Elysia } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import { authBasePlugin, roleGuard } from "../auth/auth.plugin.ts";
import { createDashboardRepository } from "./dashboard.repo.ts";
import {
  getAdminSummary,
  getGuruSummary,
  getMuridSummary,
  getOrtuSummary,
} from "./dashboard.service.ts";
import {
  successAdminSchema,
  successGuruSchema,
  successMuridSchema,
  successOrtuSchema,
} from "./dashboard.model.ts";

const repo = createDashboardRepository(db);

/**
 * Ringkasan beranda dilindungi RBAC:
 *   GET /dashboard/murid     -> khusus peran murid (data dirinya sendiri)
 *   GET /dashboard/guru      -> khusus peran guru (data miliknya)
 *   GET /dashboard/orang_tua -> khusus peran orang tua (data anak terikat)
 *   GET /dashboard/admin     -> khusus peran admin (statistik sekolah)
 */
export const dashboardModule = new Elysia({ prefix: "/dashboard" })
  .use(authBasePlugin(JWT_SECRET))
  .get(
    "/admin",
    async () => {
      const data = await getAdminSummary(repo);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["admin"]),
      response: { 200: successAdminSchema },
      detail: {
        summary: "Statistik sekolah untuk admin (RBAC: admin)",
        description:
          "Mengembalikan statistik ringkas: jumlah pengguna per peran, kelas, dan mata pelajaran, " +
          "serta tren kehadiran 7 hari terakhir di seluruh kelas.",
        tags: ["Dashboard"],
        responses: {
          "200": { description: "Statistik berhasil dimuat" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Peran tidak diizinkan mengakses endpoint" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/orang_tua",
    async ({ authUser }) => {
      const data = await getOrtuSummary(repo, { parentId: authUser!.id });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["orang_tua"]),
      response: { 200: successOrtuSchema },
      detail: {
        summary: "Ringkasan anak untuk orang tua (RBAC: orang tua)",
        description:
          "Mengembalikan daftar anak yang terhubung dengan akun orang tua, beserta kehadiran " +
          "hari ini, rekap kehadiran bulan berjalan, dan progres tugas (jumlah dikerjakan dan " +
          "rata-rata nilai).",
        tags: ["Dashboard"],
        responses: {
          "200": { description: "Ringkasan berhasil dimuat" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Peran tidak diizinkan mengakses endpoint" },
          "404": { description: "Akun orang tua tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/murid",
    async ({ authUser }) => {
      const data = await getMuridSummary(repo, { studentId: authUser!.id });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["murid"]),
      response: { 200: successMuridSchema },
      detail: {
        summary: "Ringkasan harian murid (RBAC: murid)",
        description:
          "Mengembalikan jadwal & presensi murid hari ini beserta tugas yang mendekati tenggat. " +
          "Identitas murid diambil dari token akses (hanya data milik sendiri).",
        tags: ["Dashboard"],
        responses: {
          "200": { description: "Ringkasan berhasil dimuat" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Peran tidak diizinkan mengakses endpoint" },
          "404": { description: "Murid tidak ditemukan / belum di kelas" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/guru",
    async ({ authUser }) => {
      const data = await getGuruSummary(repo, { teacherId: authUser!.id });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      response: { 200: successGuruSchema },
      detail: {
        summary: "Ringkasan harian guru (RBAC: guru)",
        description:
          "Mengembalikan jadwal mengajar guru hari ini (kelas, jam, rekap presensi, kode sesi) " +
          "beserta tugas yang menunggu penilaian. Identitas guru diambil dari token akses.",
        tags: ["Dashboard"],
        responses: {
          "200": { description: "Ringkasan berhasil dimuat" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "403": { description: "Peran tidak diizinkan mengakses endpoint" },
          "404": { description: "Guru tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );
