import { describe, expect, it } from "bun:test";
import type { ReportsStore } from "../reports.repo.ts";
import type { AssignmentsStore } from "../../assignments/assignments.repo.ts";
import type { HistoryStore } from "../../attendance/attendance.history.repo.ts";
import {
  getAdminRekap,
  getAdminRekapSiswa,
  getGuruRekap,
  getGuruRekapSiswa,
  getMuridProgress,
  getOrtuPantauan,
  getOrtuProgress,
  rekapAbsenToCsv,
  rekapNilaiToCsv,
  rekapSiswaAbsenToCsv,
  rekapSiswaNilaiToCsv,
  type RekapData,
  type RekapSiswaData,
  type ReportsServiceDeps,
} from "../reports.service.ts";
import { ForbiddenError, NotFoundError } from "../../../utils/errors.ts";

const NOW = new Date("2026-09-07T08:00:00");

// ---------------------------------------------------------------------------
// Fake ReportsStore
// ---------------------------------------------------------------------------
class FakeReportsStore implements ReportsStore {
  async studentClass(studentId: string) {
    if (studentId === "stu-1") return { classId: "c1", className: "XII IPA 1" };
    if (studentId === "stu-2") return { classId: "c2", className: "XII IPA 2" };
    return null;
  }

  async combosByTeacher() {
    return [
      { classId: "c1", className: "XII IPA 1", subjectId: "s-mtk", subjectCode: "MTK", subjectName: "Matematika" },
      { classId: "c1", className: "XII IPA 1", subjectId: "s-fis", subjectCode: "FIS", subjectName: "Fisika" },
      { classId: "c2", className: "XII IPA 2", subjectId: "s-bing", subjectCode: "BING", subjectName: "Bahasa Inggris" },
    ];
  }

  async combosAll() {
    return [
      ...(await this.combosByTeacher()),
      { classId: "c1", className: "XII IPA 1", subjectId: "s-bio", subjectCode: "BIO", subjectName: "Biologi" },
      { classId: "c3", className: "XI IPA 1", subjectId: "s-fis", subjectCode: "FIS", subjectName: "Fisika" },
    ];
  }

  async rekapNilai() {
    return [
      { classId: "c1", className: "XII IPA 1", subjectCode: "MTK", subjectName: "Matematika", taskCount: 2, gradedCount: 4, avg: 81.25, highest: 95, lowest: 70 },
      { classId: "c1", className: "XII IPA 1", subjectCode: "FIS", subjectName: "Fisika", taskCount: 1, gradedCount: 1, avg: 70, highest: 70, lowest: 70 },
      { classId: "c1", className: "XII IPA 1", subjectCode: "BIO", subjectName: "Biologi", taskCount: 3, gradedCount: 6, avg: 60, highest: 75, lowest: 45 },
      { classId: "c2", className: "XII IPA 2", subjectCode: "BING", subjectName: "Bahasa Inggris", taskCount: 2, gradedCount: 2, avg: 85, highest: 92, lowest: 78 },
      { classId: "c3", className: "XI IPA 1", subjectCode: "FIS", subjectName: "Fisika", taskCount: 1, gradedCount: 0, avg: null, highest: null, lowest: null },
    ];
  }

  async absenceStatusRows() {
    const rows: Array<{ classId: string; className: string; subjectCode: string; subjectName: string; status: "hadir" | "terlambat" | "izin" | "sakit" }> = [];
    const push = (classId: string, className: string, code: string, subjectName: string, status: "hadir" | "terlambat" | "izin" | "sakit", count: number) => {
      for (let i = 0; i < count; i++) {
        rows.push({ classId, className, subjectCode: code, subjectName, status });
      }
    };
    push("c1", "XII IPA 1", "MTK", "Matematika", "hadir", 20);
    push("c1", "XII IPA 1", "MTK", "Matematika", "terlambat", 2);
    push("c1", "XII IPA 1", "FIS", "Fisika", "hadir", 18);
    push("c1", "XII IPA 1", "FIS", "Fisika", "izin", 1);
    push("c1", "XII IPA 1", "FIS", "Fisika", "sakit", 1);
    push("c1", "XII IPA 1", "BIO", "Biologi", "hadir", 15);
    push("c1", "XII IPA 1", "BIO", "Biologi", "sakit", 1);
    push("c2", "XII IPA 2", "BING", "Bahasa Inggris", "hadir", 25);
    push("c3", "XI IPA 1", "FIS", "Fisika", "hadir", 12);
    return rows;
  }

  async classMembers(classIds: string[]) {
    const all = [
      { studentId: "stu-1", studentName: "Rani Aulia", classId: "c1", className: "XII IPA 1" },
      { studentId: "stu-2", studentName: "Bima Yoga", classId: "c2", className: "XII IPA 2" },
      { studentId: "stu-3", studentName: "Citra Kirana", classId: "c3", className: "XI IPA 1" },
    ];
    return all.filter((member) => classIds.includes(member.classId));
  }

  async assignmentTotalsForClasses(classIds: string[]) {
    const totals = [
      { classId: "c1", subjectCode: "MTK", subjectName: "Matematika", total: 2 },
      { classId: "c1", subjectCode: "FIS", subjectName: "Fisika", total: 1 },
      { classId: "c1", subjectCode: "BIO", subjectName: "Biologi", total: 3 },
      { classId: "c2", subjectCode: "BING", subjectName: "Bahasa Inggris", total: 1 },
      { classId: "c3", subjectCode: "FIS", subjectName: "Fisika", total: 1 },
    ];
    return totals.filter((row) => classIds.includes(row.classId));
  }

  async submissionRowsForMembers(studentIds: string[], classIds: string[]) {
    const rows = [
      { studentId: "stu-1", subjectCode: "MTK", subjectName: "Matematika", score: 90, gradedAt: new Date("2026-09-01T00:00:00Z") },
      { studentId: "stu-1", subjectCode: "MTK", subjectName: "Matematika", score: 80, gradedAt: new Date("2026-09-02T00:00:00Z") },
      { studentId: "stu-1", subjectCode: "FIS", subjectName: "Fisika", score: 70, gradedAt: new Date("2026-09-03T00:00:00Z") },
    ];
    return rows.filter((row) => studentIds.includes(row.studentId));
  }

  async absenceRowsForMembers(classIds: string[]) {
    const rows = [
      { studentId: "stu-1", classId: "c1", subjectCode: "MTK", status: "hadir" as const },
      { studentId: "stu-1", classId: "c1", subjectCode: "FIS", status: "terlambat" as const },
      { studentId: "stu-1", classId: "c1", subjectCode: "BIO", status: "izin" as const },
      { studentId: "stu-2", classId: "c2", subjectCode: "BING", status: "hadir" as const },
    ];
    return rows.filter((row) => classIds.includes(row.classId));
  }
}

// ---------------------------------------------------------------------------
// Fake AssignmentsStore (hanya method progres yang dipakai)
// ---------------------------------------------------------------------------
class FakeAssignmentsStore implements AssignmentsStore {
  async insertAssignment() {
    return { id: "x" };
  }
  async assignmentById() {
    return null;
  }
  async listByClassIds(classIds: string[]) {
    if (classIds.includes("c1")) {
      return [
        { id: "a1", className: "XII IPA 1", classId: "c1", subjectId: "s-mtk", subjectCode: "MTK", subjectName: "Matematika", title: "Ulangan 1", instruction: "", type: "pilihan_ganda" as const, questions: null, deadline: new Date("2026-09-10T00:00:00Z"), createdAt: NOW },
        { id: "a2", className: "XII IPA 1", classId: "c1", subjectId: "s-mtk", subjectCode: "MTK", subjectName: "Matematika", title: "Ulangan 2", instruction: "", type: "esai" as const, questions: null, deadline: new Date("2026-09-12T00:00:00Z"), createdAt: NOW },
        { id: "a3", className: "XII IPA 1", classId: "c1", subjectId: "s-fis", subjectCode: "FIS", subjectName: "Fisika", title: "Tugas Gaya", instruction: "", type: "upload" as const, questions: null, deadline: new Date("2026-09-09T00:00:00Z"), createdAt: NOW },
      ];
    }
    if (classIds.includes("c2")) {
      return [
        { id: "a4", className: "XII IPA 2", classId: "c2", subjectId: "s-bing", subjectCode: "BING", subjectName: "Bahasa Inggris", title: "Essay Writing", instruction: "", type: "esai" as const, questions: null, deadline: new Date("2026-09-11T00:00:00Z"), createdAt: NOW },
      ];
    }
    return [];
  }
  async submissionExists() {
    return false;
  }
  async insertSubmission() {
    return { id: "x" };
  }
  async updateGrade() {
    return true;
  }
  async submissionsByAssignment() {
    return [];
  }
  async gradesForStudent(studentId: string) {
    if (studentId !== "stu-1") return [];
    return [
      { submissionId: "sub1", assignmentId: "a1", title: "Ulangan 1", className: "XII IPA 1", subjectCode: "MTK", subjectName: "Matematika", type: "pilihan_ganda" as const, deadline: new Date("2026-09-10T00:00:00Z"), submittedAt: new Date("2026-09-02T00:00:00Z"), score: 90, feedback: null, gradedAt: new Date("2026-09-03T00:00:00Z") },
      { submissionId: "sub2", assignmentId: "a2", title: "Ulangan 2", className: "XII IPA 1", subjectCode: "MTK", subjectName: "Matematika", type: "esai" as const, deadline: new Date("2026-09-12T00:00:00Z"), submittedAt: new Date("2026-09-05T00:00:00Z"), score: 80, feedback: "Bagus", gradedAt: new Date("2026-09-06T00:00:00Z") },
      { submissionId: "sub3", assignmentId: "a3", title: "Tugas Gaya", className: "XII IPA 1", subjectCode: "FIS", subjectName: "Fisika", type: "upload" as const, deadline: new Date("2026-09-09T00:00:00Z"), submittedAt: new Date("2026-09-06T00:00:00Z"), score: 70, feedback: null, gradedAt: new Date("2026-09-07T00:00:00Z") },
    ];
  }
}

// ---------------------------------------------------------------------------
// Fake HistoryStore (rekap kehadiran murid & anak orang tua)
// ---------------------------------------------------------------------------
class FakeHistoryStore implements HistoryStore {
  async studentProfile(studentId: string) {
    if (studentId === "stu-1") {
      return { id: "stu-1", name: "Rani Aulia", className: "XII IPA 1" };
    }
    if (studentId === "stu-2") {
      return { id: "stu-2", name: "Bima Yoga", className: "XII IPA 2" };
    }
    return null;
  }

  async childrenOf() {
    return [
      { id: "stu-1", name: "Rani Aulia", className: "XII IPA 1" },
      { id: "stu-2", name: "Bima Yoga", className: "XII IPA 2" },
    ];
  }

  async studentHistoryRows() {
    return [
      { id: "r1", dateIso: "2026-09-07", status: "hadir" as const, scannedAt: new Date("2026-09-07T00:30:00Z"), subjectCode: "MTK", subjectName: "Matematika", teacherName: "Budi Santoso" },
      { id: "r2", dateIso: "2026-09-07", status: "terlambat" as const, scannedAt: new Date("2026-09-07T01:00:00Z"), subjectCode: "FIS", subjectName: "Fisika", teacherName: "Dewi Lestari" },
    ];
  }

  async teacherSessionRows() {
    return [];
  }
  async teacherStatusRows() {
    return [];
  }
  async dailyStatusRows() {
    return [];
  }
}

function deps(): ReportsServiceDeps {
  return {
    reports: new FakeReportsStore(),
    assignments: new FakeAssignmentsStore(),
    history: new FakeHistoryStore(),
  };
}

describe("laporan & progres service", () => {
  it("menyusun progres murid dari tugas, nilai, dan kehadiran", async () => {
    const result = await getMuridProgress(deps(), "stu-1", { now: NOW });

    expect(result.student).toEqual({
      id: "stu-1",
      name: "Rani Aulia",
      className: "XII IPA 1",
    });
    expect(result.overview).toEqual({
      avgScore: 80,
      totalTasks: 3,
      doneTasks: 3,
      gradedTasks: 3,
    });
    expect(result.presence).toEqual({
      hadir: 1,
      terlambat: 1,
      izin: 0,
      sakit: 0,
      opportunities: 2,
      presencePercent: 100,
    });

    const mtk = result.mapel.find((m) => m.subjectCode === "MTK");
    expect(mtk).toMatchObject({ totalTasks: 2, doneTasks: 2, gradedTasks: 2, avgScore: 85 });
    const fis = result.mapel.find((m) => m.subjectCode === "FIS");
    expect(fis).toMatchObject({ totalTasks: 1, doneTasks: 1, gradedTasks: 1, avgScore: 70 });
    expect(result.history).toHaveLength(2);
    expect(result.grades).toHaveLength(3);
  });

  it("murid tanpa kelas memicu NotFound", async () => {
    await expect(
      getMuridProgress(deps(), "unknown", { now: NOW }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("guru hanya melihat rekap kelas/mapel yang diampu", async () => {
    const result = await getGuruRekap(deps(), "t1", { now: NOW });

    expect(result.availableClasses).toEqual([
      { id: "c1", name: "XII IPA 1" },
      { id: "c2", name: "XII IPA 2" },
    ]);
    expect(result.nilai.map((r) => r.subjectCode)).toEqual(["FIS", "MTK", "BING"]);
    expect(result.nilai.some((r) => r.subjectCode === "BIO")).toBe(false);
    expect(result.kehadiran.map((r) => r.subjectCode)).toEqual(["FIS", "MTK", "BING"]);
  });

  it("filter kelas & mapel pada rekap guru", async () => {
    const byClass = await getGuruRekap(deps(), "t1", { classId: "c1", now: NOW });
    expect(byClass.kehadiran).toHaveLength(2);
    expect(byClass.kehadiran.map((r) => r.subjectCode).sort()).toEqual(["FIS", "MTK"]);
    expect(byClass.nilai.some((r) => r.subjectCode === "BING")).toBe(false);

    const bySubject = await getGuruRekap(deps(), "t1", { subjectCode: "MTK", now: NOW });
    expect(bySubject.nilai).toHaveLength(1);
    expect(bySubject.nilai[0]?.subjectCode).toBe("MTK");
    expect(bySubject.kehadiran).toHaveLength(1);
  });

  it("rekap kehadiran menghitung status & persentase", async () => {
    const result = await getGuruRekap(deps(), "t1", { classId: "c1", now: NOW });
    const mtk = result.kehadiran.find((r) => r.subjectCode === "MTK");
    expect(mtk).toMatchObject({
      hadir: 20,
      terlambat: 2,
      izin: 0,
      sakit: 0,
      opportunities: 22,
      presencePercent: 100,
    });
    const fis = result.kehadiran.find((r) => r.subjectCode === "FIS");
    expect(fis).toMatchObject({ hadir: 18, izin: 1, sakit: 1, presencePercent: 90 });
  });

  it("rekap admin mencakup semua kelas", async () => {
    const result = await getAdminRekap(deps(), { now: NOW });
    expect(result.availableClasses).toHaveLength(3);
    expect(result.nilai).toHaveLength(5);
    expect(result.kehadiran).toHaveLength(5);
  });

  it("orang tua memakai anak pertama & menolak anak asing", async () => {
    const result = await getOrtuProgress(deps(), "par-1", { now: NOW });
    expect(result.children).toHaveLength(2);
    expect(result.current.id).toBe("stu-1");
    expect(result.mapel.some((m) => m.subjectCode === "MTK")).toBe(true);

    await expect(
      getOrtuProgress(deps(), "par-1", { studentId: "not-child", now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("merangkum pantauan semua anak", async () => {
    const result = await getOrtuPantauan(deps(), "par-1", { now: NOW });
    expect(result.children).toHaveLength(2);
    const rani = result.children.find((c) => c.id === "stu-1")!;
    expect(rani.name).toBe("Rani Aulia");
    expect(rani.overview.doneTasks).toBe(3);
    expect(rani.mapel.some((m) => m.subjectCode === "MTK")).toBe(true);
    expect(rani.presence.opportunities).toBe(2);
    expect(rani.today).toEqual(rani.presence);
  });
});

describe("rekap per siswa", () => {
  it("menyusun rekap per siswa pada kelas tertentu", async () => {
    const result = await getGuruRekapSiswa(deps(), "t1", {
      classId: "c1",
      now: NOW,
    });
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.studentName).toBe("Rani Aulia");
    expect(row.avgScore).toBe(80);
    expect(row.totalTasks).toBe(3);
    expect(row.doneTasks).toBe(3);
    expect(row.attendance).toEqual({
      hadir: 1,
      terlambat: 1,
      izin: 0,
      sakit: 0,
      opportunities: 2,
      presencePercent: 100,
    });
    expect(row.nilai.map((n) => n.subjectCode).sort()).toEqual(["FIS", "MTK"]);
    const mtk = row.nilai.find((n) => n.subjectCode === "MTK")!;
    expect(mtk).toMatchObject({
      totalTasks: 2,
      doneTasks: 2,
      gradedTasks: 2,
      avgScore: 85,
    });
  });

  it("filter mapel membatasi kolom nilai & rekap absen", async () => {
    const result = await getGuruRekapSiswa(deps(), "t1", {
      classId: "c1",
      subjectCode: "MTK",
      now: NOW,
    });
    const row = result.rows[0]!;
    expect(row.nilai).toHaveLength(1);
    expect(row.nilai[0]?.subjectCode).toBe("MTK");
    expect(row.totalTasks).toBe(2);
    expect(row.attendance).toMatchObject({
      hadir: 1,
      terlambat: 0,
      opportunities: 1,
      presencePercent: 100,
    });
  });

  it("rekap admin mencakup seluruh mapel kelas", async () => {
    const result = await getAdminRekapSiswa(deps(), {
      classId: "c1",
      now: NOW,
    });
    const row = result.rows[0]!;
    expect(row.nilai.map((n) => n.subjectCode)).toEqual(["MTK", "FIS", "BIO"]);
    expect(row.totalTasks).toBe(6);
    expect(row.doneTasks).toBe(3);
  });
});

describe("ekspor CSV rekap", () => {
  const sample: RekapData = {
    availableClasses: [{ id: "c1", name: "XII IPA 1" }],
    currentClassId: null,
    nilai: [{
      classId: "c1",
      className: "XII IPA 1",
      subjectCode: "MTK",
      subjectName: "Matematika",
      taskCount: 2,
      gradedCount: 3,
      avg: 81.5,
      highest: 95,
      lowest: 70,
    }],
    kehadiran: [{
      classId: "c1",
      className: "XII IPA 1",
      subjectCode: "MTK",
      subjectName: "Matematika",
      hadir: 20,
      terlambat: 2,
      izin: 1,
      sakit: 1,
      opportunities: 24,
      presencePercent: 92,
    }],
  };

  it("menyusun CSV rekap nilai", () => {
    const csv = rekapNilaiToCsv(sample);
    expect(csv).toContain("Mata Pelajaran");
    expect(csv).toContain("XII IPA 1,MTK,Matematika,2,3,81.5,95,70");
  });

  it("menyusun CSV rekap kehadiran", () => {
    const csv = rekapAbsenToCsv(sample);
    expect(csv).toContain("% Kehadiran");
    expect(csv).toContain("XII IPA 1,MTK,Matematika,20,2,1,1,24,92");
  });

  it("mengutip sel yang mengandung koma", () => {
    const data: RekapData = {
      ...sample,
      nilai: [{ ...sample.nilai[0]!, className: "XII, IPA 1" }],
    };
    const csv = rekapNilaiToCsv(data);
    expect(csv).toContain('"XII, IPA 1"');
  });

  it("menyusun CSV nilai per siswa", () => {
    const siswa: RekapSiswaData = {
      availableClasses: [],
      currentClassId: null,
      rows: [{
        studentId: "s1",
        studentName: "Rani Aulia",
        className: "XII IPA 1",
        avgScore: 85,
        totalTasks: 3,
        doneTasks: 3,
        attendance: {
          hadir: 20,
          terlambat: 2,
          izin: 0,
          sakit: 0,
          opportunities: 22,
          presencePercent: 100,
        },
        nilai: [{
          subjectCode: "MTK",
          subjectName: "Matematika",
          totalTasks: 3,
          doneTasks: 3,
          gradedTasks: 3,
          avgScore: 85,
        }],
      }],
    };
    const csv = rekapSiswaNilaiToCsv(siswa);
    expect(csv).toContain("Nama Siswa");
    expect(csv).toContain("XII IPA 1,Rani Aulia,MTK,Matematika,3,3,3,85");
    const absen = rekapSiswaAbsenToCsv(siswa);
    expect(absen).toContain("% Kehadiran");
    expect(absen).toContain("XII IPA 1,Rani Aulia,20,2,0,0,22,100");
  });
});
