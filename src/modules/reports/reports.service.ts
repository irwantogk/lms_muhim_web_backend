import type { ReportsStore } from "./reports.repo.ts";
import type { AssignmentsStore } from "../assignments/assignments.repo.ts";
import type { HistoryStore } from "../attendance/attendance.history.repo.ts";
import {
  getStudentHistory,
  historyRange,
} from "../attendance/attendance.history.service.ts";
import { ForbiddenError, NotFoundError } from "../../utils/errors.ts";

export type AssignmentKind = "pilihan_ganda" | "esai" | "upload" | "campuran";

export interface ProgressMapelItem {
  subjectCode: string;
  subjectName: string;
  totalTasks: number;
  doneTasks: number;
  gradedTasks: number;
  avgScore: number | null;
}

export interface PresenceSummary {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  opportunities: number;
  presencePercent: number;
}

export interface ProgressOverview {
  avgScore: number | null;
  totalTasks: number;
  doneTasks: number;
  gradedTasks: number;
}

export interface GradeHistoryItem {
  submissionId: string;
  assignmentId: string;
  title: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  type: AssignmentKind;
  submittedAt: string;
  score: number | null;
  feedback: string | null;
}

export interface ProgressHistoryItem {
  id: string;
  dateIso: string;
  dayLabel: string;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  status: "hadir" | "terlambat" | "izin" | "sakit";
  scannedAt: string;
}

export interface StudentRef {
  id: string;
  name: string;
  className: string;
}

export interface ClassRef {
  id: string;
  name: string;
}

export interface ProgressData {
  class: ClassRef;
  overview: ProgressOverview;
  presence: PresenceSummary;
  mapel: ProgressMapelItem[];
  grades: GradeHistoryItem[];
  history: ProgressHistoryItem[];
}

export interface RekapNilaiItem {
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  taskCount: number;
  gradedCount: number;
  avg: number | null;
  highest: number | null;
  lowest: number | null;
}

export interface RekapAbsenItem {
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  opportunities: number;
  presencePercent: number;
}

export interface RekapData {
  availableClasses: Array<{ id: string; name: string }>;
  currentClassId: string | null;
  nilai: RekapNilaiItem[];
  kehadiran: RekapAbsenItem[];
}

export interface ProgressQuery {
  days?: number;
  now?: Date;
}

export interface RekapQuery extends ProgressQuery {
  classId?: string;
  subjectCode?: string;
}

export interface ReportsServiceDeps {
  reports: ReportsStore;
  assignments: AssignmentsStore;
  history: HistoryStore;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sortByClassAndSubject<T extends { className: string; subjectCode: string }>(
  rows: T[],
): T[] {
  return rows.sort((a, b) =>
    a.className.localeCompare(b.className) ||
    a.subjectCode.localeCompare(b.subjectCode)
  );
}

/** Progres belajar seorang murid: nilai & tugas per mapel + kehadiran. */
async function buildProgress(
  deps: ReportsServiceDeps,
  studentId: string,
  query: ProgressQuery = {},
): Promise<ProgressData & { student: StudentRef }> {
  const klass = await deps.reports.studentClass(studentId);
  if (!klass) {
    throw new NotFoundError("Murid belum terdaftar di kelas mana pun");
  }

  const [assignments, submissions, attendance] = await Promise.all([
    deps.assignments.listByClassIds([klass.classId]),
    deps.assignments.gradesForStudent(studentId),
    getStudentHistory(deps.history, studentId, {
      days: query.days ?? 30,
      now: query.now,
    }),
  ]);

  const own = submissions.filter((row) => row.className === klass.className);

  const totals = new Map<string, { subjectName: string; total: number }>();
  for (const assignment of assignments) {
    const entry = totals.get(assignment.subjectCode) ?? {
      subjectName: assignment.subjectName,
      total: 0,
    };
    entry.total += 1;
    totals.set(assignment.subjectCode, entry);
  }

  const done = new Map<string, number>();
  const graded = new Map<string, number>();
  const scores = new Map<string, number[]>();
  for (const row of own) {
    done.set(row.subjectCode, (done.get(row.subjectCode) ?? 0) + 1);
    if (row.score != null) {
      graded.set(row.subjectCode, (graded.get(row.subjectCode) ?? 0) + 1);
      const list = scores.get(row.subjectCode) ?? [];
      list.push(row.score);
      scores.set(row.subjectCode, list);
    }
  }

  const codes = [...new Set([...totals.keys(), ...done.keys()])].sort();
  const mapel: ProgressMapelItem[] = codes.map((code) => {
    const doneCount = done.get(code) ?? 0;
    const totalCount = Math.max(totals.get(code)?.total ?? 0, doneCount);
    const gradedCount = graded.get(code) ?? 0;
    const scored = scores.get(code) ?? [];
    const avgScore = scored.length === 0
      ? null
      : round1(scored.reduce((sum, value) => sum + value, 0) / scored.length);
    return {
      subjectCode: code,
      subjectName: totals.get(code)?.subjectName ?? code,
      totalTasks: totalCount,
      doneTasks: Math.min(doneCount, totalCount),
      gradedTasks: Math.min(gradedCount, totalCount),
      avgScore,
    };
  });

  const allScores = own
    .map((row) => row.score)
    .filter((score): score is number => score != null);

  const presence = attendance.summary;
  const grades: GradeHistoryItem[] = own
    .slice(0, 20)
    .map((row) => ({
      submissionId: row.submissionId,
      assignmentId: row.assignmentId,
      title: row.title,
      className: row.className,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      type: row.type,
      submittedAt: row.submittedAt.toISOString(),
      score: row.score,
      feedback: row.feedback,
    }));

  return {
    student: {
      id: attendance.student.id,
      name: attendance.student.name,
      className: attendance.student.className,
    },
    class: { id: klass.classId, name: klass.className },
    overview: {
      avgScore: allScores.length === 0
        ? null
        : round1(
          allScores.reduce((sum, value) => sum + value, 0) / allScores.length,
        ),
      totalTasks: assignments.length,
      doneTasks: own.length,
      gradedTasks: allScores.length,
    },
    presence: {
      hadir: presence.hadir,
      terlambat: presence.terlambat,
      izin: presence.izin,
      sakit: presence.sakit,
      opportunities: presence.total,
      presencePercent: presence.presencePercent,
    },
    mapel,
    grades,
    history: attendance.history.map((row) => ({
      id: row.id,
      dateIso: row.dateIso,
      dayLabel: row.dayLabel,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      teacherName: row.teacherName,
      status: row.status,
      scannedAt: row.scannedAt,
    })),
  };
}

export async function getMuridProgress(
  deps: ReportsServiceDeps,
  studentId: string,
  query: ProgressQuery = {},
): Promise<{ student: StudentRef } & ProgressData> {
  return buildProgress(deps, studentId, query);
}

export async function getOrtuProgress(
  deps: ReportsServiceDeps,
  parentId: string,
  query: ProgressQuery & { studentId?: string } = {},
): Promise<{ children: StudentRef[]; current: StudentRef } & ProgressData> {
  const children = await deps.history.childrenOf(parentId);
  if (children.length === 0) {
    throw new NotFoundError("Tidak ada anak terhubung ke akun ini");
  }
  const target = query.studentId
    ? children.find((child) => child.id === query.studentId)
    : children[0];
  if (!target) {
    throw new ForbiddenError("Anak tersebut tidak terhubung ke akun Anda");
  }

  const progress = await buildProgress(deps, target.id, query);
  const { student, ...rest } = progress;
  return {
    children: children.map(({ id, name, className }) => ({ id, name, className })),
    current: student,
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Pantauan orang tua — rangkuman semua anak dalam satu panggilan
// ---------------------------------------------------------------------------
export interface PantauanChild {
  id: string;
  name: string;
  className: string;
  /** Kehadiran hari ini (ringkas). */
  today: PresenceSummary;
  overview: ProgressOverview;
  /** Kehadiran dalam rentang periode (default 30 hari). */
  presence: PresenceSummary;
  mapel: ProgressMapelItem[];
  /** Riwayat nilai terbaru (maksimal 5). */
  grades: GradeHistoryItem[];
  /** Riwayat kehadiran terbaru (maksimal 10). */
  history: ProgressHistoryItem[];
}

export interface OrtuPantauanData {
  children: PantauanChild[];
}

function presenceFromSummary(summary: {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  total: number;
  presencePercent: number;
}): PresenceSummary {
  return {
    hadir: summary.hadir,
    terlambat: summary.terlambat,
    izin: summary.izin,
    sakit: summary.sakit,
    opportunities: summary.total,
    presencePercent: summary.presencePercent,
  };
}

export async function getOrtuPantauan(
  deps: ReportsServiceDeps,
  parentId: string,
  query: ProgressQuery = {},
): Promise<OrtuPantauanData> {
  const children = await deps.history.childrenOf(parentId);
  if (children.length === 0) {
    throw new NotFoundError("Tidak ada anak terhubung ke akun ini");
  }

  const days = query.days ?? 30;
  const items = await Promise.all(
    children.map(async (child) => {
      const [progress, today] = await Promise.all([
        buildProgress(deps, child.id, { days, now: query.now }),
        getStudentHistory(deps.history, child.id, { days: 1, now: query.now }),
      ]);
      return {
        id: child.id,
        name: progress.student.name,
        className: progress.student.className,
        today: presenceFromSummary(today.summary),
        overview: progress.overview,
        presence: progress.presence,
        mapel: progress.mapel,
        grades: progress.grades.slice(0, 5),
        history: progress.history.slice(0, 10),
      };
    }),
  );

  return { children: items };
}

async function buildRekap(
  deps: ReportsServiceDeps,
  combos: Array<{
    classId: string;
    className: string;
    subjectCode: string;
    subjectName: string;
  }>,
  query: RekapQuery = {},
): Promise<RekapData> {
  const availableClasses = [...new Map(
    combos.map((combo) => [combo.classId, { id: combo.classId, name: combo.className }]),
  ).values()];

  const requestedClass = query.classId &&
      availableClasses.some((c) => c.id === query.classId)
    ? query.classId
    : null;

  let scoped = requestedClass
    ? combos.filter((combo) => combo.classId === requestedClass)
    : combos;
  if (
    query.subjectCode &&
    scoped.some((combo) => combo.subjectCode === query.subjectCode)
  ) {
    scoped = scoped.filter((combo) => combo.subjectCode === query.subjectCode);
  }

  const comboKeys = new Set(
    scoped.map((combo) => `${combo.classId}:${combo.subjectCode}`),
  );
  const classIds = requestedClass
    ? [requestedClass]
    : [...new Set(combos.map((combo) => combo.classId))];

  const range = historyRange(query.days ?? 30, query.now);

  const [nilaiRows, absenceRows] = await Promise.all([
    deps.reports.rekapNilai(classIds),
    deps.reports.absenceStatusRows(classIds, range.fromIso, range.toExclusiveIso),
  ]);

  const nilai: RekapNilaiItem[] = sortByClassAndSubject(
    nilaiRows.filter((row) => comboKeys.has(`${row.classId}:${row.subjectCode}`))
      .map((row) => ({ ...row, avg: row.avg == null ? null : round1(row.avg) })),
  );

  const buckets = new Map<
    string,
    { className: string; subjectName: string; hadir: number; terlambat: number; izin: number; sakit: number }
  >();
  for (const row of absenceRows) {
    if (!comboKeys.has(`${row.classId}:${row.subjectCode}`)) continue;
    const key = `${row.classId}:${row.subjectCode}`;
    const bucket = buckets.get(key) ?? {
      className: row.className,
      subjectName: row.subjectName,
      hadir: 0,
      terlambat: 0,
      izin: 0,
      sakit: 0,
    };
    bucket[row.status] += 1;
    buckets.set(key, bucket);
  }

  const kehadiran: RekapAbsenItem[] = sortByClassAndSubject(
    [...buckets.entries()].map(([key, bucket]) => {
      const [classId, subjectCode] = key.split(":");
      const opportunities = bucket.hadir + bucket.terlambat +
        bucket.izin + bucket.sakit;
      return {
        classId,
        subjectCode,
        className: bucket.className,
        subjectName: bucket.subjectName,
        hadir: bucket.hadir,
        terlambat: bucket.terlambat,
        izin: bucket.izin,
        sakit: bucket.sakit,
        opportunities,
        presencePercent: opportunities === 0
          ? 0
          : Math.round(((bucket.hadir + bucket.terlambat) / opportunities) * 100),
      };
    }),
  );

  return {
    availableClasses,
    currentClassId: requestedClass,
    nilai,
    kehadiran,
  };
}

export async function getGuruRekap(
  deps: ReportsServiceDeps,
  teacherId: string,
  query: RekapQuery = {},
): Promise<RekapData> {
  const combos = await deps.reports.combosByTeacher(teacherId);
  return buildRekap(deps, combos, query);
}

export async function getAdminRekap(
  deps: ReportsServiceDeps,
  query: RekapQuery = {},
): Promise<RekapData> {
  const combos = await deps.reports.combosAll();
  return buildRekap(deps, combos, query);
}

// ---------------------------------------------------------------------------
// Rekap per siswa (nilai & absen) dengan filter
// ---------------------------------------------------------------------------
export interface SiswaNilaiItem {
  subjectCode: string;
  subjectName: string;
  totalTasks: number;
  doneTasks: number;
  gradedTasks: number;
  avgScore: number | null;
}

export interface RekapSiswaItem {
  studentId: string;
  studentName: string;
  className: string;
  avgScore: number | null;
  totalTasks: number;
  doneTasks: number;
  attendance: PresenceSummary;
  nilai: SiswaNilaiItem[];
}

export interface RekapSiswaData {
  availableClasses: Array<{ id: string; name: string }>;
  currentClassId: string | null;
  rows: RekapSiswaItem[];
}

const emptyStatuses = () => ({
  hadir: 0,
  terlambat: 0,
  izin: 0,
  sakit: 0,
});

async function buildRekapSiswa(
  deps: ReportsServiceDeps,
  combos: Array<{
    classId: string;
    className: string;
    subjectCode: string;
    subjectName: string;
  }>,
  query: RekapQuery = {},
): Promise<RekapSiswaData> {
  const availableClasses = [...new Map(
    combos.map((combo) => [combo.classId, { id: combo.classId, name: combo.className }]),
  ).values()];

  const requestedClass = query.classId &&
      availableClasses.some((c) => c.id === query.classId)
    ? query.classId
    : null;
  const classIds = requestedClass
    ? [requestedClass]
    : [...new Set(combos.map((combo) => combo.classId))];

  const range = historyRange(query.days ?? 30, query.now);
  const subjectFilter = query.subjectCode;

  // Kolom mapel per kelas berasal dari kombinasi yang menjadi cakupan
  // (guru: mapel yang diampu; admin: seluruh kelas). Bisa dipersempit mapel.
  const subjectsByClass = new Map<
    string,
    Array<{ subjectCode: string; subjectName: string }>
  >();
  for (const combo of combos) {
    if (subjectFilter && combo.subjectCode !== subjectFilter) continue;
    const list = subjectsByClass.get(combo.classId) ?? [];
    list.push({ subjectCode: combo.subjectCode, subjectName: combo.subjectName });
    subjectsByClass.set(combo.classId, list);
  }

  const [members, totals, absences] = await Promise.all([
    deps.reports.classMembers(classIds),
    deps.reports.assignmentTotalsForClasses(classIds),
    deps.reports.absenceRowsForMembers(classIds, range.fromIso, range.toExclusiveIso),
  ]);

  const studentIds = members.map((member) => member.studentId);
  const submissions = studentIds.length === 0
    ? []
    : await deps.reports.submissionRowsForMembers(studentIds, classIds);

  const filterSubject = subjectFilter
    ? <T extends { subjectCode: string }>(rows: T[]) =>
      rows.filter((row) => row.subjectCode === subjectFilter)
    : <T>(rows: T[]) => rows;

  const totalMap = new Map<
    string,
    { classId: string; subjectCode: string; total: number }
  >();
  for (const row of filterSubject(totals)) {
    totalMap.set(`${row.classId}|${row.subjectCode}`, row);
  }

  const submissionMap = new Map<
    string,
    { done: number; graded: number; scores: number[] }
  >();
  for (const row of filterSubject(submissions)) {
    const key = `${row.studentId}|${row.subjectCode}`;
    const bucket = submissionMap.get(key) ?? { done: 0, graded: 0, scores: [] };
    bucket.done += 1;
    if (row.gradedAt != null && row.score != null) {
      bucket.graded += 1;
      bucket.scores.push(row.score);
    }
    submissionMap.set(key, bucket);
  }

  // Hitung kehadiran per murid per kelas & mapel (agar sesuai kolom yang tampil).
  const absenceCounts = new Map<
    string,
    ReturnType<typeof emptyStatuses>
  >();
  for (const row of filterSubject(absences)) {
    const key = `${row.studentId}|${row.classId}|${row.subjectCode}`;
    const counts = absenceCounts.get(key) ?? emptyStatuses();
    counts[row.status] += 1;
    absenceCounts.set(key, counts);
  }

  const rows: RekapSiswaItem[] = members.map((member) => {
    const classSubjects = subjectsByClass.get(member.classId) ?? [];
    const nilai: SiswaNilaiItem[] = classSubjects.map((subject) => {
      const total = totalMap.get(`${member.classId}|${subject.subjectCode}`)?.total ?? 0;
      const bucket = submissionMap.get(`${member.studentId}|${subject.subjectCode}`);
      const doneCount = bucket?.done ?? 0;
      const gradedCount = bucket?.graded ?? 0;
      const scores = bucket?.scores ?? [];
      const avgScore = scores.length === 0
        ? null
        : round1(scores.reduce((sum, value) => sum + value, 0) / scores.length);
      return {
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        totalTasks: Math.max(total, doneCount),
        doneTasks: Math.min(doneCount, Math.max(total, doneCount)),
        gradedTasks: Math.min(gradedCount, Math.max(total, doneCount)),
        avgScore,
      };
    });

    // Kumpulkan seluruh skor dari bucket per mapel untuk rata-rata keseluruhan.
    const allScores: number[] = [];
    for (const subject of classSubjects) {
      const bucket = submissionMap.get(`${member.studentId}|${subject.subjectCode}`);
      if (bucket) allScores.push(...bucket.scores);
    }

    const counts = emptyStatuses();
    for (const subject of classSubjects) {
      const bucket = absenceCounts.get(
        `${member.studentId}|${member.classId}|${subject.subjectCode}`,
      );
      if (!bucket) continue;
      counts.hadir += bucket.hadir;
      counts.terlambat += bucket.terlambat;
      counts.izin += bucket.izin;
      counts.sakit += bucket.sakit;
    }
    const opportunities = counts.hadir + counts.terlambat + counts.izin + counts.sakit;

    return {
      studentId: member.studentId,
      studentName: member.studentName,
      className: member.className,
      avgScore: allScores.length === 0
        ? null
        : round1(allScores.reduce((sum, value) => sum + value, 0) / allScores.length),
      totalTasks: nilai.reduce((sum, subject) => sum + subject.totalTasks, 0),
      doneTasks: nilai.reduce((sum, subject) => sum + subject.doneTasks, 0),
      attendance: {
        ...counts,
        opportunities,
        presencePercent: opportunities === 0
          ? 0
          : Math.round(((counts.hadir + counts.terlambat) / opportunities) * 100),
      },
      nilai,
    };
  });

  return {
    availableClasses,
    currentClassId: requestedClass,
    rows,
  };
}

export async function getGuruRekapSiswa(
  deps: ReportsServiceDeps,
  teacherId: string,
  query: RekapQuery = {},
): Promise<RekapSiswaData> {
  const combos = await deps.reports.combosByTeacher(teacherId);
  return buildRekapSiswa(deps, combos, query);
}

export async function getAdminRekapSiswa(
  deps: ReportsServiceDeps,
  query: RekapQuery = {},
): Promise<RekapSiswaData> {
  const combos = await deps.reports.combosAll();
  return buildRekapSiswa(deps, combos, query);
}


// ---------------------------------------------------------------------------
// Ekspor CSV rekap
// ---------------------------------------------------------------------------
type CsvCell = string | number | null | undefined;

function escapeCell(value: CsvCell): string {
  const text = String(value ?? "");
  if (/[",\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: CsvCell[][]): string {
  const serialize = (row: CsvCell[]) => row.map(escapeCell).join(",");
  return [headers.map(escapeCell).join(","), ...rows.map(serialize)].join("\n");
}

function cellNumber(value: number | null): number | null {
  return value == null ? null : value;
}

/** CSV tabel rekap nilai (kelas, mapel, jumlah tugas, dinilai, rata-rata). */
export function rekapNilaiToCsv(data: RekapData): string {
  const headers = [
    "Kelas",
    "Kode",
    "Mata Pelajaran",
    "Jumlah Tugas",
    "Tugas Dinilai",
    "Rata-rata",
    "Tertinggi",
    "Terendah",
  ];
  const rows = data.nilai.map((row) => [
    row.className,
    row.subjectCode,
    row.subjectName,
    row.taskCount,
    row.gradedCount,
    cellNumber(row.avg),
    cellNumber(row.highest),
    cellNumber(row.lowest),
  ]);
  return toCsv(headers, rows);
}

/** CSV tabel rekap kehadiran (status + persentase kehadiran). */
export function rekapAbsenToCsv(data: RekapData): string {
  const headers = [
    "Kelas",
    "Kode",
    "Mata Pelajaran",
    "Hadir",
    "Terlambat",
    "Izin",
    "Sakit",
    "Total Catatan",
    "% Kehadiran",
  ];
  const rows = data.kehadiran.map((row) => [
    row.className,
    row.subjectCode,
    row.subjectName,
    row.hadir,
    row.terlambat,
    row.izin,
    row.sakit,
    row.opportunities,
    row.presencePercent,
  ]);
  return toCsv(headers, rows);
}

/** CSV nilai per siswa (satu baris per siswa & mapel). */
export function rekapSiswaNilaiToCsv(data: RekapSiswaData): string {
  const headers = [
    "Kelas",
    "Nama Siswa",
    "Kode",
    "Mata Pelajaran",
    "Total Tugas",
    "Tugas Dikerjakan",
    "Sudah Dinilai",
    "Rata-rata",
  ];
  const rows: CsvCell[][] = [];
  for (const student of data.rows) {
    for (const mapel of student.nilai) {
      rows.push([
        student.className,
        student.studentName,
        mapel.subjectCode,
        mapel.subjectName,
        mapel.totalTasks,
        mapel.doneTasks,
        mapel.gradedTasks,
        cellNumber(mapel.avgScore),
      ]);
    }
  }
  return toCsv(headers, rows);
}

/** CSV rekap kehadiran per siswa (satu baris per siswa). */
export function rekapSiswaAbsenToCsv(data: RekapSiswaData): string {
  const headers = [
    "Kelas",
    "Nama Siswa",
    "Hadir",
    "Terlambat",
    "Izin",
    "Sakit",
    "Total Catatan",
    "% Kehadiran",
  ];
  const rows = data.rows.map((student) => [
    student.className,
    student.studentName,
    student.attendance.hadir,
    student.attendance.terlambat,
    student.attendance.izin,
    student.attendance.sakit,
    student.attendance.opportunities,
    student.attendance.presencePercent,
  ]);
  return toCsv(headers, rows);
}
