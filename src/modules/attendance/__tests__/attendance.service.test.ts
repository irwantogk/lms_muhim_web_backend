import { describe, expect, it } from "bun:test";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../utils/errors.ts";
import type {
  AttendanceRepository,
  CreateSessionInput,
  SessionOptionRow,
  SessionRowJoined,
} from "../attendance.repo.ts";
import { createAttendanceService } from "../attendance.service.ts";

const MONDAY = new Date("2026-09-07T08:00:00");

const baseOption: SessionOptionRow = {
  classId: "cls-1",
  className: "XII IPA 1",
  subjectId: "mtk",
  subjectCode: "MTK",
  subjectName: "Matematika",
};

class FakeAttendanceRepo implements AttendanceRepository {
  created: CreateSessionInput[] = [];
  scanned = new Set<string>();
  expiryOverride: Date | null = null;
  classMembership = true;
  knownCodes = new Set<string>(["ACTIVE1"]);

  async teaches(classId: string, subjectId: string, teacherId: string) {
    return teacherId === "tea-1" && classId === "cls-1" && subjectId === "mtk";
  }

  async optionsForTeacher(teacherId: string): Promise<SessionOptionRow[]> {
    return teacherId === "tea-1" ? [baseOption] : [];
  }

  async codeExists() {
    return false;
  }

  async createSession(input: CreateSessionInput) {
    this.created.push(input);
    return { id: "sess-1" };
  }

  async closeSession(sessionId: string, teacherId: string, closedAt: Date) {
    if (sessionId !== "sess-1" || teacherId !== "tea-1") return false;
    const input = this.created[0];
    if (input) input.expiresAt = closedAt;
    return true;
  }

  async sessionByCode(code: string) {
    if (!this.knownCodes.has(code)) return null;
    const createdAt = new Date(MONDAY.getTime() - 60000);
    return {
      id: "sess-1",
      className: "XII IPA 1",
      subjectCode: "MTK",
      subjectName: "Matematika",
      code,
      createdAt,
      expiresAt: this.expiryOverride ?? new Date(MONDAY.getTime() + 3600000),
      classId: "cls-1",
    };
  }

  async studentInClass() {
    return this.classMembership;
  }

  async attendanceExists(_sessionId: string, studentId: string) {
    return this.scanned.has(studentId);
  }

  async createAttendanceRecord(_sessionId: string, studentId: string) {
    this.scanned.add(studentId);
  }

  async sessionsForTeacherOnDate(_teacherId: string, date: string) {
    const input = this.created.find((c) => c.date === date);
    if (!input) return [];
    const row: SessionRowJoined = {
      id: "sess-1",
      className: "XII IPA 1",
      subjectCode: "MTK",
      subjectName: "Matematika",
      code: input.code,
      createdAt: new Date(MONDAY.getTime() - 1000),
      expiresAt: input.expiresAt,
    };
    return [row];
  }
}

describe("attendanceService", () => {
  it("membuat sesi dengan kode acak & waktu kedaluwarsa", async () => {
    const repo = new FakeAttendanceRepo();
    const service = createAttendanceService({ repo });

    const session = await service.createSession({
      teacherId: "tea-1",
      classId: "cls-1",
      subjectId: "mtk",
      validMinutes: 30,
      now: MONDAY,
    });

    expect(session.code.length).toBeGreaterThanOrEqual(6);
    expect(session.className).toBe("XII IPA 1");
    const created = repo.created[0];
    expect(created?.date).toBe("2026-09-07");
    expect(created?.expiresAt.getTime()).toBe(
      MONDAY.getTime() + 30 * 60 * 1000,
    );
  });

  it("menolak guru yang bukan pengampu kelas/mapel", async () => {
    const repo = new FakeAttendanceRepo();
    const service = createAttendanceService({ repo });

    expect(
      service.createSession({
        teacherId: "tea-1",
        classId: "cls-9",
        subjectId: "fis",
        now: MONDAY,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("menutup sesi dan membuat kode tidak berlaku lagi", async () => {
    const repo = new FakeAttendanceRepo();
    const service = createAttendanceService({ repo });

    await service.createSession({
      teacherId: "tea-1",
      classId: "cls-1",
      subjectId: "mtk",
      validMinutes: 60,
      now: MONDAY,
    });

    const closed = await service.closeSession("sess-1", "tea-1", MONDAY);
    expect(closed.expiresAt).toBe(MONDAY.toISOString());
    expect(repo.created[0]?.expiresAt.getTime()).toBe(MONDAY.getTime());
  });

  it("mengembalikan opsi & sesi hari ini untuk guru", async () => {    const repo = new FakeAttendanceRepo();
    const service = createAttendanceService({ repo });

    await service.createSession({
      teacherId: "tea-1",
      classId: "cls-1",
      subjectId: "mtk",
      now: MONDAY,
    });

    const options = await service.optionsForTeacher("tea-1");
    expect(options[0]?.className).toBe("XII IPA 1");

    const sessions = await service.todaySessions("tea-1", MONDAY);
    expect(sessions[0]?.code).toBeTruthy();
    expect(sessions[0]?.expiresAt).toBeTruthy();
  });
});

describe("attendanceService.scan (murid)", () => {
  it("mencatat kehadiran saat kode valid & belum pernah dipakai", async () => {
    const repo = new FakeAttendanceRepo();
    const service = createAttendanceService({ repo });

    const result = await service.scan("active1", "stu-1", MONDAY);

    expect(result.status).toBe("hadir");
    expect(result.code).toBe("ACTIVE1");
    expect(result.subjectName).toBe("Matematika");
    expect(repo.scanned.has("stu-1")).toBe(true);
  });

  it("menolak kode yang tidak dikenal", async () => {
    const repo = new FakeAttendanceRepo();
    repo.knownCodes = new Set();
    await expect(
      createAttendanceService({ repo }).scan("ZZZZZZ", "stu-1", MONDAY),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("menolak kode kedaluwarsa", async () => {
    const repo = new FakeAttendanceRepo();
    repo.expiryOverride = new Date(MONDAY.getTime() - 1000);
    await expect(
      createAttendanceService({ repo }).scan("ACTIVE1", "stu-1", MONDAY),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("menolak murid yang bukan anggota kelas sesi", async () => {
    const repo = new FakeAttendanceRepo();
    repo.classMembership = false;
    await expect(
      createAttendanceService({ repo }).scan("ACTIVE1", "stu-1", MONDAY),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("menolak pencatatan ganda", async () => {
    const repo = new FakeAttendanceRepo();
    const service = createAttendanceService({ repo });
    await service.scan("ACTIVE1", "stu-1", MONDAY);
    await expect(
      service.scan("ACTIVE1", "stu-1", MONDAY),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
