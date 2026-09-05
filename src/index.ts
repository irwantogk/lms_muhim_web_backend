import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { authModule } from "./modules/auth/auth.routes.ts";
import { attendanceModule } from "./modules/attendance/attendance.routes.ts";
import { attendanceHistoryModule } from "./modules/attendance/attendance.history.routes.ts";
import { assignmentsModule } from "./modules/assignments/assignments.routes.ts";
import { forumModule } from "./modules/forum/forum.routes.ts";
import { materialsModule, uploadsModule } from "./modules/materials/materials.routes.ts";
import { dashboardModule } from "./modules/dashboard/dashboard.routes.ts";
import { scheduleModule } from "./modules/schedule/schedule.routes.ts";
import { reportsModule } from "./modules/reports/reports.routes.ts";
import { schoolModule } from "./modules/school/school.routes.ts";
import { AppError, toErrorBody } from "./utils/errors.ts";
import { ensureBucket } from "./utils/s3.ts";

const port = Number(process.env["PORT"] ?? 3000);

/** Ringkas detail validasi Elysia menjadi pesan yang mudah dibaca. */
function describeValidation(rawMessage: string): string {
  const compact = `Permintaan tidak valid: ${rawMessage}`;
  if (compact.length <= 400) return compact;
  return `${compact.slice(0, 397)}…`;
}

export const app = new Elysia()
  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "LMS SMA Muhammadiyah Imogiri — API",
          version: "0.1.0",
          description:
            "Backend Elysia untuk aplikasi LMS SMA. Saat ini menyediakan API ringkasan harian " +
            "(Dashboard) untuk peran Murid dan Guru.",
        },
        tags: [
          { name: "Dashboard", description: "Ringkasan harian beranda sesuai peran" },
        ],
      },
    }),
  )
  .onError(({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return toErrorBody(error);
    }

    if (code === "VALIDATION") {
      set.status = 400;
      const message = error instanceof Error
        ? describeValidation(error.message)
        : "Permintaan tidak valid";
      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message,
          details: error instanceof Error ? [error.message] : [],
        },
      };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false as const,
        error: {
          code: "ROUTE_NOT_FOUND",
          message: "Endpoint tidak ditemukan",
          details: [],
        },
      };
    }

    console.error("[internal-error]", error);
    set.status = 500;
    return {
      success: false as const,
      error: {
        code: "INTERNAL_ERROR",
        message: "Terjadi kesalahan pada server",
        details: [],
      },
    };
  })
  .get("/", () => ({
    name: "lms-sma-api",
    version: "0.1.0",
    endpoints: {
      docs: "/docs",
      login: "/auth/login",
      muridSummary: "/dashboard/murid",
      guruSummary: "/dashboard/guru",
      muridProgress: "/reports/progress/murid",
      ortuProgress: "/reports/progress/orang-tua",
      ortuPantauan: "/reports/pantauan/orang-tua",
      guruRekap: "/reports/rekap/guru",
      guruRekapCsv: "/reports/rekap/guru/csv?jenis=nilai",
      guruRekapSiswa: "/reports/rekap/guru/siswa",
      guruRekapSiswaCsv: "/reports/rekap/guru/siswa/csv?jenis=nilai",
      adminRekap: "/reports/rekap/admin",
      adminRekapCsv: "/reports/rekap/admin/csv?jenis=kehadiran",
      adminRekapSiswa: "/reports/rekap/admin/siswa",
      adminRekapSiswaCsv: "/reports/rekap/admin/siswa/csv?jenis=kehadiran",
    },
  }))
  .use(authModule)
  .use(attendanceModule)
  .use(attendanceHistoryModule)
  .use(assignmentsModule)
  .use(materialsModule)
  .use(uploadsModule)
  .use(scheduleModule)
  .use(forumModule)
  .use(dashboardModule)
  .use(reportsModule)
  .use(schoolModule);

try {
  await ensureBucket();
} catch (error) {
  console.warn(
    "[s3] bucket tidak bisa dipastikan saat boot (MinIO menyala?):",
    error instanceof Error ? error.message : error,
  );
}

app.listen(port);

console.log(`🦊 LMS API berjalan di http://localhost:${port} (dokumentasi: /docs)`);
