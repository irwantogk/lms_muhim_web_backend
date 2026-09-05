import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";

export const scheduleClassOptionSchema = t.Object({
  id: t.String(),
  name: t.String(),
});

export const weeklySessionSchema = t.Object({
  classId: t.String(),
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  teacherName: t.String(),
  startTime: t.String(),
  endTime: t.String(),
});

export const scheduleDaySchema = t.Object({
  day: t.Integer(),
  label: t.String(),
  isToday: t.Boolean(),
  sessions: t.Array(weeklySessionSchema),
});

export const weeklyScheduleSchema = t.Object({
  currentClassId: t.Union([t.String(), t.Null()]),
  currentClassName: t.Union([t.String(), t.Null()]),
  availableClasses: t.Array(scheduleClassOptionSchema),
  days: t.Array(scheduleDaySchema),
});

export const successWeeklySchema = t.Object({
  success: t.Literal(true),
  data: weeklyScheduleSchema,
});

export const scheduleQuerySchema = t.Object({
  classId: t.Optional(
    t.String({ pattern: uuidPattern, description: "ID kelas (opsional)" }),
  ),
});

export type WeeklySchedule = Static<typeof weeklyScheduleSchema>;
