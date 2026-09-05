import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";
import { roleSchema } from "../auth/auth.model.ts";

export const historyQuerySchema = t.Object({
  days: t.Optional(t.Integer({ minimum: 1, maximum: 365 })),
  studentId: t.Optional(
    t.String({ pattern: uuidPattern, description: "ID anak (khusus orang tua)" }),
  ),
});

export const historyStatusSchema = t.Union([
  t.Literal("hadir"),
  t.Literal("terlambat"),
  t.Literal("izin"),
  t.Literal("sakit"),
]);

const historySummarySchema = t.Object({
  hadir: t.Integer(),
  terlambat: t.Integer(),
  izin: t.Integer(),
  sakit: t.Integer(),
  total: t.Integer(),
  presencePercent: t.Integer(),
});

const studentHistoryItemSchema = t.Object({
  id: t.String(),
  dateIso: t.String(),
  dayLabel: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  teacherName: t.String(),
  status: historyStatusSchema,
  scannedAt: t.String(),
});

const childRefSchema = t.Object({
  id: t.String(),
  name: t.String(),
  className: t.String(),
});

export const studentHistoryDataSchema = t.Object({
  scope: roleSchema,
  student: childRefSchema,
  summary: historySummarySchema,
  history: t.Array(studentHistoryItemSchema),
});

export const parentHistoryDataSchema = t.Object({
  scope: roleSchema,
  children: t.Array(childRefSchema),
  current: childRefSchema,
  summary: historySummarySchema,
  history: t.Array(studentHistoryItemSchema),
});

const teacherSessionSchema = t.Object({
  sessionId: t.String(),
  dateIso: t.String(),
  dayLabel: t.String(),
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  code: t.String(),
  hadir: t.Integer(),
  terlambat: t.Integer(),
  izin: t.Integer(),
  sakit: t.Integer(),
});

export const teacherHistoryDataSchema = t.Object({
  scope: roleSchema,
  sessions: t.Array(teacherSessionSchema),
});

const dailyRowSchema = t.Object({
  dateIso: t.String(),
  dayLabel: t.String(),
  hadir: t.Integer(),
  terlambat: t.Integer(),
  izin: t.Integer(),
  sakit: t.Integer(),
});

export const schoolHistoryDataSchema = t.Object({
  scope: roleSchema,
  daily: t.Array(dailyRowSchema),
  summary: historySummarySchema,
});

export const successStudentHistorySchema = t.Object({
  success: t.Literal(true),
  data: studentHistoryDataSchema,
});
export const successParentHistorySchema = t.Object({
  success: t.Literal(true),
  data: parentHistoryDataSchema,
});
export const successTeacherHistorySchema = t.Object({
  success: t.Literal(true),
  data: teacherHistoryDataSchema,
});
export const successSchoolHistorySchema = t.Object({
  success: t.Literal(true),
  data: schoolHistoryDataSchema,
});

export type StudentHistoryData = Static<typeof studentHistoryDataSchema>;
export type ParentHistoryData = Static<typeof parentHistoryDataSchema>;
export type TeacherHistoryData = Static<typeof teacherHistoryDataSchema>;
export type SchoolHistoryData = Static<typeof schoolHistoryDataSchema>;
