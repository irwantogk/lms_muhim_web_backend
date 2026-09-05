import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";

export const attendanceCreateBodySchema = t.Object({
  classId: t.String({ pattern: uuidPattern, description: "ID kelas (uuid)" }),
  subjectId: t.String({ pattern: uuidPattern, description: "ID mata pelajaran (uuid)" }),
  validMinutes: t.Optional(
    t.Integer({
      minimum: 5,
      maximum: 240,
      description: "Lama kode berlaku (menit), default 60",
    }),
  ),
});

export const scanBodySchema = t.Object({
  code: t.String({
    minLength: 4,
    maxLength: 32,
    description: "Kode presensi dari guru",
  }),
});

export const scanResultSchema = t.Object({
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  code: t.String(),
  status: t.Literal("hadir"),
  scannedAt: t.String(),
});

export const successScanSchema = t.Object({
  success: t.Literal(true),
  data: scanResultSchema,
});

export const attendanceSessionSchema = t.Object({
  id: t.String(),
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  code: t.String(),
  createdAt: t.String(),
  expiresAt: t.String(),
});

export const createOptionSchema = t.Object({
  classId: t.String(),
  className: t.String(),
  subjectId: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
});

export const sessionsListSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({ sessions: t.Array(attendanceSessionSchema) }),
});

export const createSuccessSchema = t.Object({
  success: t.Literal(true),
  data: attendanceSessionSchema,
});

export const optionsSuccessSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({ options: t.Array(createOptionSchema) }),
});

export type AttendanceSession = Static<typeof attendanceSessionSchema>;
export type CreateOption = Static<typeof createOptionSchema>;
