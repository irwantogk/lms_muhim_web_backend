import type { Role } from "../../common/types.ts";
import type { WeeklySchedule } from "./schedule.model.ts";
import type {
  ClassOption,
  ScheduleRepository,
} from "./schedule.repo.ts";

const DAY_LABEL: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
};

export interface ScheduleServiceOptions {
  role: Role;
  userId: string;
  requestedClassId?: string;
  now?: Date;
}

export function createScheduleService(repo: ScheduleRepository) {
  async function classesForRole(role: Role, userId: string): Promise<ClassOption[]> {
    switch (role) {
      case "murid": {
        const klass = await repo.findStudentClass(userId);
        return klass ? [klass] : [];
      }
      case "guru":
        return repo.classesOfTeacher(userId);
      case "orang_tua":
        return repo.classesOfChildren(userId);
      case "admin":
        return repo.allClasses();
    }
  }

  return {
    async weeklySchedule(options: ScheduleServiceOptions): Promise<WeeklySchedule> {
      const now = options.now ?? new Date();
      const availableClasses = await classesForRole(options.role, options.userId);

      const current =
        availableClasses.find((c) => c.id === options.requestedClassId) ??
        availableClasses[0] ??
        null;

      const days: WeeklySchedule["days"] = [];
      for (let day = 1; day <= 5; day++) {
        const sessions = current
          ? await repo.classSessionsOnDay(current.id, day)
          : [];
        days.push({
          day,
          label: DAY_LABEL[day] ?? "-",
          isToday: day === now.getDay(),
          sessions,
        });
      }

      return {
        currentClassId: current?.id ?? null,
        currentClassName: current?.name ?? null,
        availableClasses,
        days,
      };
    },
  };
}

export type ScheduleService = ReturnType<typeof createScheduleService>;
