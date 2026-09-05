import { describe, expect, it } from "bun:test";
import { ForbiddenError } from "../../../utils/errors.ts";
import type { HistoryStore } from "../attendance.history.repo.ts";
import {
  getParentHistory,
  getStudentHistory,
} from "../attendance.history.service.ts";

const NOW = new Date("2026-09-07T08:00:00");

class FakeHistoryStore implements HistoryStore {
  async studentProfile(studentId: string) {
    if (studentId === "stu-1") {
      return { id: "stu-1", name: "Rani Aulia", className: "XII IPA 1" };
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
      {
        id: "rec-1",
        dateIso: "2026-09-07",
        status: "hadir" as const,
        scannedAt: new Date("2026-09-07T00:30:00Z"),
        subjectCode: "MTK",
        subjectName: "Matematika",
        teacherName: "Budi Santoso",
      },
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

describe("attendance history service", () => {
  it("merangkum riwayat murid", async () => {
    const result = await getStudentHistory(new FakeHistoryStore(), "stu-1", {
      now: NOW,
    });

    expect(result.student.name).toBe("Rani Aulia");
    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.dateIso).toBe("2026-09-07");
    expect(result.history[0]?.dayLabel).toBe("Senin");
    expect(result.summary.hadir).toBe(1);
    expect(result.summary.presencePercent).toBe(100);
  });

  it("orang tua memakai anak pertama bila tidak memilih", async () => {
    const result = await getParentHistory(new FakeHistoryStore(), "par-1", {
      now: NOW,
    });

    expect(result.children).toHaveLength(2);
    expect(result.current.id).toBe("stu-1");
  });

  it("menolak memilih anak yang tidak terhubung", async () => {
    await expect(
      getParentHistory(new FakeHistoryStore(), "par-1", {
        studentId: "not-child",
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
