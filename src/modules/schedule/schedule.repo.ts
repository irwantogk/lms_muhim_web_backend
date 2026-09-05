import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import {
  classes,
  classStudents,
  classSubjectTeacher,
  parentStudents,
  schedules,
  subjects,
  users,
} from "../../db/schema.ts";

export interface ClassOption {
  id: string;
  name: string;
}

export interface SessionSlotRow {
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleRepository {
  findStudentClass(studentId: string): Promise<ClassOption | null>;
  classesOfTeacher(teacherId: string): Promise<ClassOption[]>;
  classesOfChildren(parentId: string): Promise<ClassOption[]>;
  allClasses(): Promise<ClassOption[]>;
  classSessionsOnDay(classId: string, dayOfWeek: number): Promise<SessionSlotRow[]>;
}

export function createScheduleRepository(db: Database): ScheduleRepository {
  return {
    async findStudentClass(studentId) {
      const [row] = await db
        .select({ id: classes.id, name: classes.name })
        .from(classStudents)
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(classStudents.studentId, studentId))
        .limit(1);
      return row ?? null;
    },

    async classesOfTeacher(teacherId) {
      const rows = await db
        .select({ id: classes.id, name: classes.name })
        .from(classSubjectTeacher)
        .innerJoin(classes, eq(classSubjectTeacher.classId, classes.id))
        .where(eq(classSubjectTeacher.teacherId, teacherId))
        .groupBy(classes.id, classes.name)
        .orderBy(classes.name);
      return rows;
    },

    async classesOfChildren(parentId) {
      const rows = await db
        .select({ id: classes.id, name: classes.name })
        .from(parentStudents)
        .innerJoin(classStudents, eq(parentStudents.studentId, classStudents.studentId))
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(parentStudents.parentId, parentId))
        .groupBy(classes.id, classes.name)
        .orderBy(classes.name);
      return rows;
    },

    async allClasses() {
      const rows = await db
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .orderBy(classes.name);
      return rows;
    },

    async classSessionsOnDay(classId, dayOfWeek) {
      const rows = await db
        .select({
          classId: schedules.classId,
          className: classes.name,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          teacherName: users.fullName,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
        })
        .from(schedules)
        .innerJoin(classes, eq(schedules.classId, classes.id))
        .innerJoin(subjects, eq(schedules.subjectId, subjects.id))
        .innerJoin(
          classSubjectTeacher,
          and(
            eq(classSubjectTeacher.classId, schedules.classId),
            eq(classSubjectTeacher.subjectId, schedules.subjectId),
          ),
        )
        .innerJoin(users, eq(classSubjectTeacher.teacherId, users.id))
        .where(
          and(
            eq(schedules.classId, classId),
            eq(schedules.dayOfWeek, dayOfWeek),
          ),
        )
        .orderBy(schedules.startTime);
      return rows.map((row) => ({
        ...row,
        startTime: row.startTime.slice(0, 5),
        endTime: row.endTime.slice(0, 5),
      }));
    },
  };
}
