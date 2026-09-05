import { describe, expect, it } from "bun:test";
import type { ScheduleRepository } from "../schedule.repo.ts";
import { createScheduleService } from "../schedule.service.ts";

const MONDAY = new Date("2026-09-07T08:00:00");

class FakeScheduleRepo implements ScheduleRepository {
  async findStudentClass() {
    return { id: "c1", name: "XII IPA 1" };
  }
  async classesOfTeacher() {
    return [
      { id: "c1", name: "XII IPA 1" },
      { id: "c2", name: "XII IPA 2" },
    ];
  }
  async classesOfChildren() {
    return [{ id: "c1", name: "XII IPA 1" }];
  }
  async allClasses() {
    return [
      { id: "c1", name: "XII IPA 1" },
      { id: "c2", name: "XII IPA 2" },
    ];
  }
  async classSessionsOnDay(classId: string, dayOfWeek: number) {
    if (classId !== "c1" || dayOfWeek !== 1) return [];
    return [
      {
        classId: "c1",
        className: "XII IPA 1",
        subjectCode: "MTK",
        subjectName: "Matematika",
        teacherName: "Budi Santoso",
        startTime: "07:00",
        endTime: "08:40",
      },
    ];
  }
}

describe("scheduleService.weeklySchedule", () => {
  it("murid mendapat jadwal kelasnya sendiri (5 hari)", async () => {
    const service = createScheduleService(new FakeScheduleRepo());
    const result = await service.weeklySchedule({
      role: "murid",
      userId: "m1",
      now: MONDAY,
    });

    expect(result.currentClassId).toBe("c1");
    expect(result.availableClasses).toHaveLength(1);
    expect(result.days).toHaveLength(5);
    const monday = result.days[0];
    expect(monday?.label).toBe("Senin");
    expect(monday?.isToday).toBe(true);
    expect(monday?.sessions[0]?.subjectCode).toBe("MTK");
  });

  it("guru bisa memilih kelas yang diampu; kelas lain tidak diizinkan", async () => {
    const service = createScheduleService(new FakeScheduleRepo());
    const result = await service.weeklySchedule({
      role: "guru",
      userId: "g1",
      requestedClassId: "c2",
      now: MONDAY,
    });

    expect(result.currentClassId).toBe("c2");
    expect(result.days[0]?.sessions).toHaveLength(0);
  });
});
