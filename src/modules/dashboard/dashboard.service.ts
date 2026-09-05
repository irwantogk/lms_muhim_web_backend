import type {
  AssignmentRow,
  AttendanceStatus,
  ChildRow,
  DashboardRepository,
  GradingRow,
  ParentRow,
  ScheduleJoinRow,
  SessionRow,
  StatusCounts,
  StudentRow,
  TeacherRow,
} from "./dashboard.repo.ts";
import type { AdminData, GuruData, MuridData, OrtuData } from "./dashboard.model.ts";
import { NotFoundError } from "../../utils/errors.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateContext {
  iso: string;
  weekday: number;
}

export function toDateContext(date: Date): DateContext {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return { iso: `${year}-${month}-${day}`, weekday: date.getDay() };
}

function trimTime(value: string): string {
  return value.length > 5 ? value.slice(0, 5) : value;
}

function daysLeft(deadline: Date, now: Date): number {
  return Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
}

type StatusCount = {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
};

function countStatuses(statuses: AttendanceStatus[]): StatusCount {
  const result: StatusCount = { hadir: 0, terlambat: 0, izin: 0, sakit: 0 };
  for (const status of statuses) {
    result[status] += 1;
  }
  return result;
}

function resolveOverall(
  counts: StatusCount,
  totalSessions: number,
): MuridData["attendance"]["overall"] {
  if (totalSessions === 0) return "belum";
  if (counts.hadir > 0) return "hadir";
  if (counts.terlambat > 0) return "terlambat";
  if (counts.izin > 0) return "izin";
  if (counts.sakit > 0) return "sakit";
  return "belum";
}

interface MuridContext {
  student: StudentRow;
  schedule: ScheduleJoinRow[];
  sessions: SessionRow[];
  records: Array<{
    sessionId: string;
    studentId: string;
    status: AttendanceStatus;
  }>;
}

export interface MuridSummaryOptions {
  studentId: string;
  now?: Date;
}

export interface GuruSummaryOptions {
  teacherId: string;
  now?: Date;
}

function statusForMurid(ctx: MuridContext, scheduleId: string): AttendanceStatus | "belum" {
  const row = ctx.schedule.find((r) => r.scheduleId === scheduleId);
  if (!row) return "belum";
  const session = ctx.sessions.find(
    (s) => s.classId === row.classId && s.subjectId === row.subjectId,
  );
  if (!session) return "belum";
  const record = ctx.records.find(
    (r) => r.sessionId === session.id && r.studentId === ctx.student.id,
  );
  return record?.status ?? "belum";
}

export async function getMuridSummary(
  repo: DashboardRepository,
  options: MuridSummaryOptions,
): Promise<MuridData> {
  const now = options.now ?? new Date();
  const { iso, weekday } = toDateContext(now);

  const student = await repo.findStudentById(options.studentId);
  if (!student) {
    throw new NotFoundError("Murid tidak ditemukan");
  }
  if (!student.classId || !student.className) {
    throw new NotFoundError("Murid belum terdaftar di kelas mana pun");
  }

  const ctx: MuridContext = {
    student,
    schedule: await repo.scheduleForClassOnDay(student.classId, weekday),
    sessions: await repo.sessionsOnDate(iso),
    records: await repo.recordsOnDate(iso),
  };

  const statuses = ctx.schedule.map((row) => {
    const status = statusForMurid(ctx, row.scheduleId);
    if (status !== "belum") return status;
    return null;
  }).filter((value): value is AttendanceStatus => value !== null);

  const counts = countStatuses(statuses);
  const totalSessions = ctx.schedule.length;

  const records = ctx.schedule.map((row) => ({
    scheduleId: row.scheduleId,
    subjectCode: row.subjectCode,
    subjectName: row.subjectName,
    teacherName: row.teacherName,
    startTime: trimTime(row.startTime),
    endTime: trimTime(row.endTime),
    status: statusForMurid(ctx, row.scheduleId),
  }));

  const nowMs = now.getTime();
  const assignments = (await repo.assignmentsForClass(student.classId))
    .filter((task) => task.deadline.getTime() >= nowMs - DAY_MS)
    .slice(0, 3)
    .map((task: AssignmentRow) => ({
      id: task.id,
      title: task.title,
      className: task.className,
      subjectName: task.subjectName,
      type: task.type,
      deadline: task.deadline.toISOString(),
      daysLeft: Math.max(0, daysLeft(task.deadline, now)),
    }));

  return {
    date: iso,
    weekday,
    student: { id: student.id, name: student.name, className: student.className },
    attendance: {
      overall: resolveOverall(counts, totalSessions),
      ...counts,
      totalSessions,
    },
    records,
    assignments,
  };
}

export async function getGuruSummary(
  repo: DashboardRepository,
  options: GuruSummaryOptions,
): Promise<GuruData> {
  const now = options.now ?? new Date();
  const { iso, weekday } = toDateContext(now);

  const teacher: TeacherRow | null = await repo.findTeacherById(options.teacherId);
  if (!teacher) {
    throw new NotFoundError("Guru tidak ditemukan");
  }

  const schedule = await repo.scheduleForTeacherOnDay(teacher.id, weekday);
  const sessions = await repo.sessionsOnDate(iso);
  const records = await repo.recordsOnDate(iso);

  const classTotals = new Map<string, number>();
  for (const classId of new Set(schedule.map((row) => row.classId))) {
    classTotals.set(classId, await repo.studentCountInClass(classId));
  }

  const sessionItems = schedule.map((row) => {
    const session = sessions.find(
      (s) =>
        s.classId === row.classId &&
        s.subjectId === row.subjectId &&
        s.teacherId === teacher.id,
    );
    const sessionRecords = session
      ? records.filter((r) => r.sessionId === session.id)
      : [];
    const present = sessionRecords.filter((r) =>
      r.status === "hadir" || r.status === "terlambat"
    ).length;

    return {
      scheduleId: row.scheduleId,
      className: row.className,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      startTime: trimTime(row.startTime),
      endTime: trimTime(row.endTime),
      present,
      total: classTotals.get(row.classId) ?? 0,
      code: session?.code ?? null,
    };
  });

  const toGrade = (await repo.pendingGradingForTeacher(teacher.id)).map(
    (item: GradingRow) => ({
      assignmentId: item.assignmentId,
      title: item.title,
      className: item.className,
      subjectName: item.subjectName,
      deadline: item.deadline.toISOString(),
      pending: item.pending,
    }),
  );

  return {
    date: iso,
    weekday,
    teacher: { id: teacher.id, name: teacher.name },
    sessions: sessionItems,
    toGrade,
  };
}

export interface OrtuSummaryOptions {
  parentId: string;
  now?: Date;
}

type Snapshot = OrtuData["children"][number]["today"];

function snapshotFromCounts(counts: StatusCounts): Snapshot {
  const totalSessions = counts.total;
  return {
    overall: resolveOverall(counts, totalSessions),
    hadir: counts.hadir,
    terlambat: counts.terlambat,
    izin: counts.izin,
    sakit: counts.sakit,
    totalSessions,
  };
}

/**
 * Ringkasan anak untuk orang tua: kehadiran hari ini + bulan berjalan dan
 * progres tugas (jumlah dikerjakan, rata-rata nilai).
 */
export async function getOrtuSummary(
  repo: DashboardRepository,
  options: OrtuSummaryOptions,
): Promise<OrtuData> {
  const now = options.now ?? new Date();
  const { iso, weekday } = toDateContext(now);

  const parent: ParentRow | null = await repo.findParentById(options.parentId);
  if (!parent) {
    throw new NotFoundError("Akun orang tua tidak ditemukan");
  }

  const childrenRows: ChildRow[] = await repo.childrenOfParent(options.parentId);
  const sessions = await repo.sessionsOnDate(iso);
  const records = await repo.recordsOnDate(iso);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEndExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthStartIso = toDateContext(monthStart).iso;
  const monthEndIso = toDateContext(monthEndExclusive).iso;

  const children = await Promise.all(
    childrenRows.map(async (child): Promise<OrtuData["children"][number]> => {
      const schedule = await repo.scheduleForClassOnDay(child.classId, weekday);

      const present: AttendanceStatus[] = [];
      for (const row of schedule) {
        const session = sessions.find(
          (s) => s.classId === row.classId && s.subjectId === row.subjectId,
        );
        if (!session) continue;
        const record = records.find(
          (r) => r.sessionId === session.id && r.studentId === child.studentId,
        );
        if (record) present.push(record.status);
      }
      const todayCounts: StatusCounts = {
        hadir: present.filter((s) => s === "hadir").length,
        terlambat: present.filter((s) => s === "terlambat").length,
        izin: present.filter((s) => s === "izin").length,
        sakit: present.filter((s) => s === "sakit").length,
        total: schedule.length,
      };

      const monthlyCounts = await repo.monthlyAttendanceCounts(
        child.studentId,
        monthStartIso,
        monthEndIso,
      );
      const progress = await repo.studentTaskProgress(child.classId, child.studentId);

      return {
        id: child.studentId,
        name: child.studentName,
        className: child.className,
        today: snapshotFromCounts(todayCounts),
        monthly: snapshotFromCounts(monthlyCounts),
        avgScore: progress.avgScore,
        taskDone: progress.tasksDone,
        taskTotal: progress.totalTasks,
      };
    }),
  );

  return {
    date: iso,
    weekday,
    parent: { id: parent.id, name: parent.name },
    children,
  };
}

export interface AdminSummaryOptions {
  now?: Date;
}

const DAY_LABEL_SHORT = [
  "Min",
  "Sen",
  "Sel",
  "Rab",
  "Kam",
  "Jum",
  "Sab",
];

export async function getAdminSummary(
  repo: DashboardRepository,
  options: AdminSummaryOptions = {},
): Promise<AdminData> {
  const now = options.now ?? new Date();
  const { iso, weekday } = toDateContext(now);

  const counts = await repo.getSchoolCounts();

  const stats: AdminData["stats"] = [
    { label: "Total Pengguna", value: counts.totalUsers, hint: `${counts.admins} admin`, tone: "primary" },
    { label: "Guru", value: counts.gurus, hint: "Pengajar aktif", tone: "guru" },
    { label: "Murid", value: counts.murids, hint: "Terdaftar", tone: "murid" },
    { label: "Orang Tua", value: counts.orangTuas, hint: "Akun terhubung", tone: "ortu" },
    { label: "Kelas", value: counts.classes, hint: "Seluruh rombongan", tone: "admin" },
    { label: "Mata Pelajaran", value: counts.subjects, hint: "Diajarkan", tone: "primary" },
  ];

  // Tren 7 hari terakhir (inkl. hari ini)
  const days: Date[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(now);
    day.setDate(now.getDate() - offset);
    days.push(day);
  }

  const startIso = toDateContext(days[0] ?? now).iso;
  const endExclusive = new Date(now);
  endExclusive.setDate(now.getDate() + 1);
  const endIso = toDateContext(endExclusive).iso;

  const rows = await repo.attendanceRecordsBetween(startIso, endIso);

  const byIso = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const dayMap = byIso.get(row.date) ?? new Map<string, number>();
    dayMap.set(row.status, (dayMap.get(row.status) ?? 0) + 1);
    byIso.set(row.date, dayMap);
  }

  const weeklyTrend: AdminData["weeklyTrend"] = days.map((day) => {
    const dayIso = toDateContext(day).iso;
    const dayMap = byIso.get(dayIso) ?? new Map<string, number>();
    const at = (status: string) => dayMap.get(status) ?? 0;
    return {
      label: DAY_LABEL_SHORT[day.getDay()] ?? "-",
      hadir: at("hadir"),
      terlambat: at("terlambat"),
      izin: at("izin"),
      sakit: at("sakit"),
    };
  });

  return { date: iso, weekday, stats, weeklyTrend };
}
