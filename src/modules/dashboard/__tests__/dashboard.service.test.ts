import { describe, expect, it } from "bun:test";
import {
  type AssignmentRow,
  type AttendanceStatus,
  type DashboardRepository,
  type GradingRow,
  type ScheduleJoinRow,
  type SessionRow,
  type StudentRow,
  type TeacherRow,
} from "../dashboard.repo.ts";
import {
  getAdminSummary,
  getGuruSummary,
  getMuridSummary,
  getOrtuSummary,
} from "../dashboard.service.ts";
import { NotFoundError } from "../../../utils/errors.ts";

const MONDAY = new Date("2026-09-07T08:00:00");
const SATURDAY = new Date("2026-09-05T08:00:00");

const student: StudentRow = {
  id: "stu-1",
  name: "Rani Aulia",
  role: "murid",
  classId: "cls-1",
  className: "XII IPA 1",
};

const teacher: TeacherRow = { id: "tea-1", name: "Budi Santoso", role: "guru" };

const muridSchedule: ScheduleJoinRow[] = [
  {
    scheduleId: "sc-a",
    classId: "cls-1",
    className: "XII IPA 1",
    subjectId: "mtk",
    subjectCode: "MTK",
    subjectName: "Matematika",
    teacherName: "Budi Santoso",
    startTime: "07:00:00",
    endTime: "08:40:00",
  },
  {
    scheduleId: "sc-b",
    classId: "cls-1",
    className: "XII IPA 1",
    subjectId: "fis",
    subjectCode: "FIS",
    subjectName: "Fisika",
    teacherName: "Ratna Puspita",
    startTime: "08:40:00",
    endTime: "10:20:00",
  },
];

const guruSchedule: ScheduleJoinRow[] = [
  { ...muridSchedule[0] },
  {
    scheduleId: "sc-c",
    classId: "cls-2",
    className: "XII IPA 2",
    subjectId: "mtk",
    subjectCode: "MTK",
    subjectName: "Matematika",
    teacherName: "Budi Santoso",
    startTime: "10:20:00",
    endTime: "12:00:00",
  },
];

const sessions: SessionRow[] = [
  { id: "ses-1", classId: "cls-1", subjectId: "mtk", teacherId: "tea-1", code: "ATD-1" },
  { id: "ses-2", classId: "cls-1", subjectId: "fis", teacherId: "tea-2", code: "ATD-2" },
];

type RecordInput = { sessionId: string; studentId: string; status: AttendanceStatus };

function makeRepo(overrides: Partial<DashboardRepository> = {}): DashboardRepository {
  return {
    async findStudentById() {
      return student;
    },
    async findTeacherById() {
      return teacher;
    },
    async findParentById() {
      return null;
    },
    async childrenOfParent() {
      return [];
    },
    async monthlyAttendanceCounts() {
      return { hadir: 0, terlambat: 0, izin: 0, sakit: 0, total: 0 };
    },
    async studentTaskProgress() {
      return { totalTasks: 0, tasksDone: 0, avgScore: 0 };
    },
    async getSchoolCounts() {
      return {
        totalUsers: 0,
        admins: 0,
        gurus: 0,
        murids: 0,
        orangTuas: 0,
        classes: 0,
        subjects: 0,
      };
    },
    async attendanceRecordsBetween() {
      return [];
    },
    async scheduleForClassOnDay() {
      return muridSchedule;
    },
    async scheduleForTeacherOnDay() {
      return guruSchedule;
    },
    async sessionsOnDate() {
      return sessions;
    },
    async recordsOnDate() {
      return [] as RecordInput[];
    },
    async studentCountInClass(classId) {
      return classId === "cls-1" ? 3 : 1;
    },
    async assignmentsForClass(): Promise<AssignmentRow[]> {
      const future = new Date("2026-09-09T12:00:00");
      return [
        {
          id: "asg-1",
          title: "Kuis Turunan Fungsi",
          className: "XII IPA 1",
          subjectName: "Matematika",
          type: "pilihan_ganda",
          deadline: future,
        },
      ];
    },
    async pendingGradingForTeacher(): Promise<GradingRow[]> {
      return [
        {
          assignmentId: "asg-9",
          title: "Kuis Turunan Fungsi",
          className: "XII IPA 1",
          subjectName: "Matematika",
          deadline: new Date("2026-09-08T12:00:00"),
          pending: 2,
        },
      ];
    },
    ...overrides,
  };
}

describe("getMuridSummary", () => {
  it("mengembalikan jadwal + presensi + tugas hari ini", async () => {
    const records: RecordInput[] = [
      { sessionId: "ses-1", studentId: "stu-1", status: "hadir" },
      { sessionId: "ses-2", studentId: "stu-1", status: "terlambat" },
    ];
    const repo = makeRepo({ recordsOnDate: async () => records });

    const result = await getMuridSummary(repo, { studentId: "stu-1", now: MONDAY });

    expect(result.date).toBe("2026-09-07");
    expect(result.weekday).toBe(1);
    expect(result.student.name).toBe("Rani Aulia");
    expect(result.attendance.totalSessions).toBe(2);
    expect(result.attendance.overall).toBe("hadir");
    expect(result.attendance.terlambat).toBe(1);
    expect(result.records).toHaveLength(2);
    expect(result.records[1]?.status).toBe("terlambat");
    expect(result.records[0]?.startTime).toBe("07:00");
    expect(result.assignments[0]?.subjectName).toBe("Matematika");
  });

  it("menandai belum bila tidak ada jadwal (akhir pekan)", async () => {
    const repo = makeRepo({ scheduleForClassOnDay: async () => [] });

    const result = await getMuridSummary(repo, { studentId: "stu-1", now: SATURDAY });

    expect(result.attendance.overall).toBe("belum");
    expect(result.attendance.totalSessions).toBe(0);
    expect(result.records).toHaveLength(0);
  });

  it("menolak murid yang tidak dikenal", async () => {
    const repo = makeRepo({ findStudentById: async () => null });
    expect(
      getMuridSummary(repo, { studentId: "nobody", now: MONDAY }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getGuruSummary", () => {
  it("mengembalikan sesi mengajar + rekap presensi + antrean koreksi", async () => {
    const records: RecordInput[] = [
      { sessionId: "ses-1", studentId: "stu-a", status: "hadir" },
      { sessionId: "ses-1", studentId: "stu-b", status: "hadir" },
      { sessionId: "ses-1", studentId: "stu-c", status: "terlambat" },
    ];
    const repo = makeRepo({ recordsOnDate: async () => records });

    const result = await getGuruSummary(repo, { teacherId: "tea-1", now: MONDAY });

    expect(result.teacher.name).toBe("Budi Santoso");
    expect(result.sessions).toHaveLength(2);
    const first = result.sessions[0];
    expect(first?.className).toBe("XII IPA 1");
    expect(first?.present).toBe(3);
    expect(first?.total).toBe(3);
    expect(first?.code).toBe("ATD-1");
    const second = result.sessions[1];
    expect(second?.total).toBe(1);
    expect(second?.code).toBeNull();
    expect(result.toGrade[0]?.pending).toBe(2);
    expect(result.toGrade[0]?.title).toBe("Kuis Turunan Fungsi");
  });

  it("menolak guru yang tidak dikenal", async () => {
    const repo = makeRepo({ findTeacherById: async () => null });
    expect(
      getGuruSummary(repo, { teacherId: "nobody", now: MONDAY }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getOrtuSummary", () => {
  it("mengembalikan kehadiran & progres tiap anak", async () => {
    const parent = { id: "par-1", name: "Siti Rahayu", role: "orang_tua" as const };
    const children = [
      {
        studentId: "stu-1",
        studentName: "Rani Aulia",
        className: "XII IPA 1",
        classId: "cls-1",
      },
    ];
    const records: RecordInput[] = [
      { sessionId: "ses-1", studentId: "stu-1", status: "hadir" },
    ];
    const repo = makeRepo({
      findParentById: async () => parent,
      childrenOfParent: async () => children,
      scheduleForClassOnDay: async () => [muridSchedule[0]!],
      recordsOnDate: async () => records,
      monthlyAttendanceCounts: async () => ({
        hadir: 16,
        terlambat: 2,
        izin: 1,
        sakit: 1,
        total: 20,
      }),
      studentTaskProgress: async () => ({
        totalTasks: 4,
        tasksDone: 3,
        avgScore: 86,
      }),
    });

    const result = await getOrtuSummary(repo, { parentId: "par-1", now: MONDAY });

    expect(result.parent.name).toBe("Siti Rahayu");
    expect(result.children).toHaveLength(1);
    const child = result.children[0];
    expect(child?.name).toBe("Rani Aulia");
    expect(child?.className).toBe("XII IPA 1");
    expect(child?.today.overall).toBe("hadir");
    expect(child?.today.totalSessions).toBe(1);
    expect(child?.monthly.hadir).toBe(16);
    expect(child?.monthly.totalSessions).toBe(20);
    expect(child?.taskDone).toBe(3);
    expect(child?.taskTotal).toBe(4);
    expect(child?.avgScore).toBe(86);
  });

  it("menolak akun yang bukan orang tua", async () => {
    const repo = makeRepo({ findParentById: async () => null });
    expect(
      getOrtuSummary(repo, { parentId: "nobody", now: MONDAY }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getAdminSummary", () => {
  it("menghitung statistik & tren kehadiran 7 hari", async () => {
    const repo = makeRepo({
      getSchoolCounts: async () => ({
        totalUsers: 14,
        admins: 1,
        gurus: 5,
        murids: 5,
        orangTuas: 3,
        classes: 3,
        subjects: 5,
      }),
      attendanceRecordsBetween: async () => [
        { date: "2026-09-07", status: "hadir" as const },
        { date: "2026-09-07", status: "hadir" as const },
        { date: "2026-09-07", status: "terlambat" as const },
      ],
    });

    const result = await getAdminSummary(repo, { now: MONDAY });

    expect(result.stats[0]?.value).toBe(14);
    expect(result.stats[0]?.label).toBe("Total Pengguna");
    expect(result.stats[5]?.value).toBe(5);
    expect(result.weeklyTrend).toHaveLength(7);
    const today = result.weeklyTrend[result.weeklyTrend.length - 1];
    expect(today?.label).toBe("Sen");
    expect(today?.hadir).toBe(2);
    expect(today?.terlambat).toBe(1);
  });
});
