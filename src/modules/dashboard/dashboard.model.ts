import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";

export const attendanceStatusSchema = t.Union([  t.Literal("hadir"),
  t.Literal("terlambat"),
  t.Literal("izin"),
  t.Literal("sakit"),
]);

export const attendanceTodaySchema = t.Union([
  t.Literal("hadir"),
  t.Literal("terlambat"),
  t.Literal("izin"),
  t.Literal("sakit"),
  t.Literal("belum"),
]);

export const assignmentTypeSchema = t.Union([
  t.Literal("pilihan_ganda"),
  t.Literal("esai"),
  t.Literal("upload"),
  t.Literal("campuran"),
]);

export const recordItemSchema = t.Object({
  scheduleId: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  teacherName: t.String(),
  startTime: t.String(),
  endTime: t.String(),
  status: attendanceTodaySchema,
});

export const attendanceSummarySchema = t.Object({
  overall: attendanceTodaySchema,
  hadir: t.Integer(),
  terlambat: t.Integer(),
  izin: t.Integer(),
  sakit: t.Integer(),
  totalSessions: t.Integer(),
});

export const assignmentItemSchema = t.Object({
  id: t.String(),
  title: t.String(),
  className: t.String(),
  subjectName: t.String(),
  type: assignmentTypeSchema,
  deadline: t.String(),
  daysLeft: t.Integer(),
});

export const muridDataSchema = t.Object({
  date: t.String(),
  weekday: t.Integer(),
  student: t.Object({
    id: t.String(),
    name: t.String(),
    className: t.String(),
  }),
  attendance: attendanceSummarySchema,
  records: t.Array(recordItemSchema),
  assignments: t.Array(assignmentItemSchema),
});

export const classSessionItemSchema = t.Object({
  scheduleId: t.String(),
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  startTime: t.String(),
  endTime: t.String(),
  present: t.Integer(),
  total: t.Integer(),
  code: t.Union([t.String(), t.Null()]),
});

export const gradingItemSchema = t.Object({
  assignmentId: t.String(),
  title: t.String(),
  className: t.String(),
  subjectName: t.String(),
  deadline: t.String(),
  pending: t.Integer(),
});

export const guruDataSchema = t.Object({
  date: t.String(),
  weekday: t.Integer(),
  teacher: t.Object({
    id: t.String(),
    name: t.String(),
  }),
  sessions: t.Array(classSessionItemSchema),
  toGrade: t.Array(gradingItemSchema),
});

export const childOrtuSchema = t.Object({
  id: t.String(),
  name: t.String(),
  className: t.String(),
  today: attendanceSummarySchema,
  monthly: attendanceSummarySchema,
  avgScore: t.Integer(),
  taskDone: t.Integer(),
  taskTotal: t.Integer(),
});

export const ortuDataSchema = t.Object({
  date: t.String(),
  weekday: t.Integer(),
  parent: t.Object({
    id: t.String(),
    name: t.String(),
  }),
  children: t.Array(childOrtuSchema),
});

export const successOrtuSchema = t.Object({
  success: t.Literal(true),
  data: ortuDataSchema,
});

export const statToneSchema = t.Union([
  t.Literal("primary"),
  t.Literal("admin"),
  t.Literal("guru"),
  t.Literal("murid"),
  t.Literal("ortu"),
]);

export const adminStatItemSchema = t.Object({
  label: t.String(),
  value: t.Integer(),
  hint: t.String(),
  tone: statToneSchema,
});

export const weeklyTrendItemSchema = t.Object({
  label: t.String(),
  hadir: t.Integer(),
  terlambat: t.Integer(),
  izin: t.Integer(),
  sakit: t.Integer(),
});

export const adminDataSchema = t.Object({
  date: t.String(),
  weekday: t.Integer(),
  stats: t.Array(adminStatItemSchema),
  weeklyTrend: t.Array(weeklyTrendItemSchema),
});

export const successAdminSchema = t.Object({
  success: t.Literal(true),
  data: adminDataSchema,
});

export const successMuridSchema = t.Object({
  success: t.Literal(true),
  data: muridDataSchema,
});

export const successGuruSchema = t.Object({
  success: t.Literal(true),
  data: guruDataSchema,
});

export type MuridData = Static<typeof muridDataSchema>;
export type GuruData = Static<typeof guruDataSchema>;
export type OrtuData = Static<typeof ortuDataSchema>;
export type AdminData = Static<typeof adminDataSchema>;
