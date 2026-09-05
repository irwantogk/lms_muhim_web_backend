import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";
import { assignmentTypeSchema } from "../assignments/assignments.model.ts";

export const reportStatusSchema = t.Union([
  t.Literal("hadir"),
  t.Literal("terlambat"),
  t.Literal("izin"),
  t.Literal("sakit"),
]);

const studentRefSchema = t.Object({
  id: t.String(),
  name: t.String(),
  className: t.String(),
});

const classRefSchema = t.Object({
  id: t.String(),
  name: t.String(),
});

const progressMapelSchema = t.Object({
  subjectCode: t.String(),
  subjectName: t.String(),
  totalTasks: t.Integer(),
  doneTasks: t.Integer(),
  gradedTasks: t.Integer(),
  avgScore: t.Union([t.Number(), t.Null()]),
});

const presenceSummarySchema = t.Object({
  hadir: t.Integer(),
  terlambat: t.Integer(),
  izin: t.Integer(),
  sakit: t.Integer(),
  opportunities: t.Integer(),
  presencePercent: t.Integer(),
});

const progressOverviewSchema = t.Object({
  avgScore: t.Union([t.Number(), t.Null()]),
  totalTasks: t.Integer(),
  doneTasks: t.Integer(),
  gradedTasks: t.Integer(),
});

const gradeHistoryItemSchema = t.Object({
  submissionId: t.String(),
  assignmentId: t.String(),
  title: t.String(),
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  type: assignmentTypeSchema,
  submittedAt: t.String(),
  score: t.Union([t.Number(), t.Null()]),
  feedback: t.Union([t.String(), t.Null()]),
});

const progressHistoryItemSchema = t.Object({
  id: t.String(),
  dateIso: t.String(),
  dayLabel: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  teacherName: t.String(),
  status: reportStatusSchema,
  scannedAt: t.String(),
});

const progressDataSchema = t.Object({
  class: classRefSchema,
  overview: progressOverviewSchema,
  presence: presenceSummarySchema,
  mapel: t.Array(progressMapelSchema),
  grades: t.Array(gradeHistoryItemSchema),
  history: t.Array(progressHistoryItemSchema),
});

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------
export const progressQuerySchema = t.Object({
  days: t.Optional(t.Integer({ minimum: 1, maximum: 365 })),
});

export const ortuProgressQuerySchema = t.Object({
  days: t.Optional(t.Integer({ minimum: 1, maximum: 365 })),
  studentId: t.Optional(
    t.String({ pattern: uuidPattern, description: "ID anak (harus milik sendiri)" }),
  ),
});

export const rekapQuerySchema = t.Object({
  days: t.Optional(t.Integer({ minimum: 1, maximum: 365 })),
  classId: t.Optional(
    t.String({ pattern: uuidPattern, description: "Filter kelas (opsional)" }),
  ),
  subjectCode: t.Optional(
    t.String({ maxLength: 20, description: "Filter kode mapel (opsional)" }),
  ),
});

export const rekapCsvQuerySchema = t.Object({
  jenis: t.Optional(
    t.Union(
      [t.Literal("nilai"), t.Literal("kehadiran")],
      { description: "Jenis rekap yang diunduh (default: nilai)" },
    ),
  ),
  days: t.Optional(t.Integer({ minimum: 1, maximum: 365 })),
  classId: t.Optional(
    t.String({ pattern: uuidPattern, description: "Filter kelas (opsional)" }),
  ),
  subjectCode: t.Optional(
    t.String({ maxLength: 20, description: "Filter kode mapel (opsional)" }),
  ),
});

// ---------------------------------------------------------------------------
// Murid progress
// ---------------------------------------------------------------------------
export const muridProgressDataSchema = t.Object({
  student: studentRefSchema,
  ...progressDataSchema.properties,
});

export const successMuridProgressSchema = t.Object({
  success: t.Literal(true),
  data: muridProgressDataSchema,
});

// ---------------------------------------------------------------------------
// Orang tua progress
// ---------------------------------------------------------------------------
export const ortuProgressDataSchema = t.Object({
  children: t.Array(studentRefSchema),
  current: studentRefSchema,
  ...progressDataSchema.properties,
});

export const successOrtuProgressSchema = t.Object({
  success: t.Literal(true),
  data: ortuProgressDataSchema,
});

// ---------------------------------------------------------------------------
// Rekap (guru & admin)
// ---------------------------------------------------------------------------
const rekapNilaiItemSchema = t.Object({
  classId: t.String(),
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  taskCount: t.Integer(),
  gradedCount: t.Integer(),
  avg: t.Union([t.Number(), t.Null()]),
  highest: t.Union([t.Number(), t.Null()]),
  lowest: t.Union([t.Number(), t.Null()]),
});

const rekapAbsenItemSchema = t.Object({
  classId: t.String(),
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  hadir: t.Integer(),
  terlambat: t.Integer(),
  izin: t.Integer(),
  sakit: t.Integer(),
  opportunities: t.Integer(),
  presencePercent: t.Integer(),
});

const rekapDataSchema = t.Object({
  availableClasses: t.Array(
    t.Object({ id: t.String(), name: t.String() }),
  ),
  currentClassId: t.Union([t.String(), t.Null()]),
  nilai: t.Array(rekapNilaiItemSchema),
  kehadiran: t.Array(rekapAbsenItemSchema),
});

export const successGuruRekapSchema = t.Object({
  success: t.Literal(true),
  data: rekapDataSchema,
});

export const successAdminRekapSchema = t.Object({
  success: t.Literal(true),
  data: rekapDataSchema,
});

// ---------------------------------------------------------------------------
// Rekap per siswa (nilai & absen)
// ---------------------------------------------------------------------------
const siswaNilaiItemSchema = t.Object({
  subjectCode: t.String(),
  subjectName: t.String(),
  totalTasks: t.Integer(),
  doneTasks: t.Integer(),
  gradedTasks: t.Integer(),
  avgScore: t.Union([t.Number(), t.Null()]),
});

const siswaPresenceSchema = t.Object({
  hadir: t.Integer(),
  terlambat: t.Integer(),
  izin: t.Integer(),
  sakit: t.Integer(),
  opportunities: t.Integer(),
  presencePercent: t.Integer(),
});

const rekapSiswaItemSchema = t.Object({
  studentId: t.String(),
  studentName: t.String(),
  className: t.String(),
  avgScore: t.Union([t.Number(), t.Null()]),
  totalTasks: t.Integer(),
  doneTasks: t.Integer(),
  attendance: siswaPresenceSchema,
  nilai: t.Array(siswaNilaiItemSchema),
});

const rekapSiswaDataSchema = t.Object({
  availableClasses: t.Array(
    t.Object({ id: t.String(), name: t.String() }),
  ),
  currentClassId: t.Union([t.String(), t.Null()]),
  rows: t.Array(rekapSiswaItemSchema),
});

export const successGuruRekapSiswaSchema = t.Object({
  success: t.Literal(true),
  data: rekapSiswaDataSchema,
});

export const successAdminRekapSiswaSchema = t.Object({
  success: t.Literal(true),
  data: rekapSiswaDataSchema,
});

// ---------------------------------------------------------------------------
// Pantauan orang tua (rangkuman semua anak)
// ---------------------------------------------------------------------------
const pantauanChildSchema = t.Object({
  id: t.String(),
  name: t.String(),
  className: t.String(),
  today: presenceSummarySchema,
  overview: progressOverviewSchema,
  presence: presenceSummarySchema,
  mapel: t.Array(progressMapelSchema),
  grades: t.Array(gradeHistoryItemSchema),
  history: t.Array(progressHistoryItemSchema),
});

const pantauanDataSchema = t.Object({
  children: t.Array(pantauanChildSchema),
});

export const successPantauanOrtuSchema = t.Object({
  success: t.Literal(true),
  data: pantauanDataSchema,
});

export type PantauanOrtuData = Static<typeof pantauanDataSchema>;

export type MuridProgressData = Static<typeof muridProgressDataSchema>;
export type OrtuProgressData = Static<typeof ortuProgressDataSchema>;
export type RekapData = Static<typeof rekapDataSchema>;
export type RekapSiswaData = Static<typeof rekapSiswaDataSchema>;
