import type { HistoryStore } from "./attendance.history.repo.ts";
import { ForbiddenError, NotFoundError } from "../../utils/errors.ts";

type Status = "hadir" | "terlambat" | "izin" | "sakit";

export interface Summary {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  total: number;
  presencePercent: number;
}

export interface StudentHistoryItem {
  id: string;
  dateIso: string;
  dayLabel: string;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  status: Status;
  scannedAt: string;
}

export interface StudentHistoryData {
  student: { id: string; name: string; className: string };
  summary: Summary;
  history: StudentHistoryItem[];
}

export interface ParentHistoryData {
  children: Array<{ id: string; name: string; className: string }>;
  current: { id: string; name: string; className: string };
  summary: Summary;
  history: StudentHistoryItem[];
}

export interface TeacherHistoryData {
  sessions: Array<{
    sessionId: string;
    dateIso: string;
    dayLabel: string;
    className: string;
    subjectCode: string;
    subjectName: string;
    code: string;
    hadir: number;
    terlambat: number;
    izin: number;
    sakit: number;
  }>;
}

export interface SchoolHistoryData {
  daily: Array<{
    dateIso: string;
    dayLabel: string;
    hadir: number;
    terlambat: number;
    izin: number;
    sakit: number;
  }>;
  summary: Summary;
}

const DAY_LABEL = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayLabelOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return DAY_LABEL[date.getDay()] ?? "-";
}

export interface RangeDays {
  fromIso: string;
  toExclusiveIso: string;
}

export function historyRange(days: number, now = new Date()): RangeDays {
  const from = new Date(now);
  from.setDate(from.getDate() - (Math.max(1, days) - 1));
  const to = new Date(now);
  to.setDate(to.getDate() + 1);
  return { fromIso: isoOf(from), toExclusiveIso: isoOf(to) };
}

function emptyBuckets(): Record<Status, number> {
  return { hadir: 0, terlambat: 0, izin: 0, sakit: 0 };
}

function summarize(buckets: Record<Status, number>): Summary {
  const total =
    buckets.hadir + buckets.terlambat + buckets.izin + buckets.sakit;
  const presencePercent = total === 0
    ? 0
    : Math.round(((buckets.hadir + buckets.terlambat) / total) * 100);
  return { ...buckets, total, presencePercent };
}

export interface HistoryQuery {
  days?: number;
  now?: Date;
}

export async function getStudentHistory(
  store: HistoryStore,
  studentId: string,
  query: HistoryQuery = {},
): Promise<StudentHistoryData> {
  const range = historyRange(query.days ?? 30, query.now);
  const student = await store.studentProfile(studentId);
  if (!student) throw new NotFoundError("Murid tidak ditemukan");

  const rows = await store.studentHistoryRows(
    studentId,
    range.fromIso,
    range.toExclusiveIso,
  );

  const buckets = emptyBuckets();
  for (const row of rows) buckets[row.status] += 1;

  const history: StudentHistoryItem[] = rows.map((row) => ({
    id: row.id,
    dateIso: row.dateIso,
    dayLabel: dayLabelOf(row.dateIso),
    subjectCode: row.subjectCode,
    subjectName: row.subjectName,
    teacherName: row.teacherName,
    status: row.status,
    scannedAt: row.scannedAt.toISOString(),
  }));

  return { student, summary: summarize(buckets), history };
}

export async function getParentHistory(
  store: HistoryStore,
  parentId: string,
  options: HistoryQuery & { studentId?: string } = {},
): Promise<ParentHistoryData> {
  const children = await store.childrenOf(parentId);
  if (children.length === 0) {
    throw new NotFoundError("Tidak ada anak terhubung ke akun ini");
  }

  const current = options.studentId
    ? children.find((child) => child.id === options.studentId)
    : children[0];
  if (!current) {
    throw new ForbiddenError("Anak tersebut tidak terhubung ke akun Anda");
  }

  const data = await getStudentHistory(store, current.id, options);
  return {
    children: children.map(({ id, name, className }) => ({ id, name, className })),
    current: data.student,
    summary: data.summary,
    history: data.history,
  };
}

export async function getTeacherHistory(
  store: HistoryStore,
  teacherId: string,
  query: HistoryQuery = {},
): Promise<TeacherHistoryData> {
  const range = historyRange(query.days ?? 30, query.now);
  const sessions = await store.teacherSessionRows(
    teacherId,
    range.fromIso,
    range.toExclusiveIso,
  );
  const statuses = await store.teacherStatusRows(
    teacherId,
    range.fromIso,
    range.toExclusiveIso,
  );

  const countsBySession = new Map<string, Record<Status, number>>();
  for (const status of statuses) {
    const counts = countsBySession.get(status.sessionId) ?? emptyBuckets();
    counts[status.status] += 1;
    countsBySession.set(status.sessionId, counts);
  }

  return {
    sessions: sessions.map((session) => {
      const counts = countsBySession.get(session.sessionId) ?? emptyBuckets();
      return {
        sessionId: session.sessionId,
        dateIso: session.dateIso,
        dayLabel: dayLabelOf(session.dateIso),
        className: session.className,
        subjectCode: session.subjectCode,
        subjectName: session.subjectName,
        code: session.code,
        hadir: counts.hadir,
        terlambat: counts.terlambat,
        izin: counts.izin,
        sakit: counts.sakit,
      };
    }),
  };
}

export async function getSchoolHistory(
  store: HistoryStore,
  query: HistoryQuery = {},
): Promise<SchoolHistoryData> {
  const range = historyRange(query.days ?? 30, query.now);
  const rows = await store.dailyStatusRows(range.fromIso, range.toExclusiveIso);

  const byDate = new Map<string, Record<Status, number>>();
  const totals = emptyBuckets();
  for (const row of rows) {
    const buckets = byDate.get(row.dateIso) ?? emptyBuckets();
    buckets[row.status] += 1;
    byDate.set(row.dateIso, buckets);
    totals[row.status] += 1;
  }

  const daily = [...byDate.entries()].map(([dateIso, buckets]) => ({
    dateIso,
    dayLabel: dayLabelOf(dateIso),
    hadir: buckets.hadir,
    terlambat: buckets.terlambat,
    izin: buckets.izin,
    sakit: buckets.sakit,
  }));

  return { daily, summary: summarize(totals) };
}
