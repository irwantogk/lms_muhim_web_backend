import { Elysia } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import { authBasePlugin, requireAccessToken } from "../auth/auth.plugin.ts";
import { createScheduleRepository } from "./schedule.repo.ts";
import { createScheduleService } from "./schedule.service.ts";
import {
  scheduleQuerySchema,
  successWeeklySchema,
} from "./schedule.model.ts";

const scheduleService = createScheduleService(createScheduleRepository(db));

/** Jadwal mingguan sesuai peran pengguna (murid/guru/orang tua/admin). */
export const scheduleModule = new Elysia({ prefix: "/schedules" })
  .use(authBasePlugin(JWT_SECRET))
  .get(
    "/weekly",
    async ({ query, authUser }) => {
      const data = await scheduleService.weeklySchedule({
        role: authUser!.role,
        userId: authUser!.id,
        requestedClassId: query.classId,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: requireAccessToken(),
      query: scheduleQuerySchema,
      response: { 200: successWeeklySchema },
      detail: {
        summary: "Jadwal pelajaran mingguan sesuai peran",
        description:
          "Mengembalikan jadwal Senin–Jumat. Kelas yang dijadwalkan mengikuti peran: murid " +
          "(kelasnya), guru (kelas yang diampu), orang tua (kelas anak), admin (bisa memilih kelas). " +
          "Bisa difilter via query `classId`.",
        tags: ["Schedules"],
        responses: {
          "200": { description: "Jadwal mingguan dimuat" },
          "401": { description: "Token akses tidak disertakan / tidak valid" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );
