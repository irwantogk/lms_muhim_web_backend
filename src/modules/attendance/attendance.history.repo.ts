import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import {
  attendanceRecords,
  attendanceSessions,
  classes,
  classStudents,
  parentStudents,
  subjects,
  users,
} from "../../db/schema.ts";

export type AttendanceStatus = "hadir" | "terlambat" | "izin" | "sakit";

export interface StudentProfile {
  id: string;
  name: string;
  className: string;
}

export interface ChildProfile {
  id: string;
  name: string;
  className: string;
}

export interface StudentHistoryRow {
  id: string;
  dateIso: string;
  status: AttendanceStatus;
  scannedAt: Date;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
}

export interface TeacherSessionRow {
  sessionId: string;
  dateIso: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  code: string;
}

export interface SessionStatusRow {
  sessionId: string;
  status: AttendanceStatus;
}

export interface DailyStatusRow {
  dateIso: string;
  status: AttendanceStatus;
}

export interface HistoryStore {
  studentProfile(studentId: string): Promise<StudentProfile | null>;
  childrenOf(parentId: string): Promise<ChildProfile[]>;
  studentHistoryRows(
    studentId: string,
    fromIso: string,
    toExclusiveIso: string,
  ): Promise<StudentHistoryRow[]>;
  teacherSessionRows(
    teacherId: string,
    fromIso: string,
    toExclusiveIso: string,
  ): Promise<TeacherSessionRow[]>;
  teacherStatusRows(
    teacherId: string,
    fromIso: string,
    toExclusiveIso: string,
  ): Promise<SessionStatusRow[]>;
  dailyStatusRows(fromIso: string, toExclusiveIso: string): Promise<DailyStatusRow[]>;
}

export function createHistoryStore(db: Database): HistoryStore {
  return {
    async studentProfile(studentId) {
      const [user] = await db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(eq(users.id, studentId))
        .limit(1);
      if (!user) return null;
      const [membership] = await db
        .select({ name: classes.name })
        .from(classStudents)
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(classStudents.studentId, studentId))
        .limit(1);
      return {
        id: user.id,
        name: user.name,
        className: membership?.name ?? "-",
      };
    },

    async childrenOf(parentId) {
      const rows = await db
        .select({
          id: users.id,
          name: users.fullName,
          className: classes.name,
        })
        .from(parentStudents)
        .innerJoin(users, eq(parentStudents.studentId, users.id))
        .innerJoin(
          classStudents,
          eq(classStudents.studentId, parentStudents.studentId),
        )
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(parentStudents.parentId, parentId))
        .orderBy(users.fullName);
      return rows;
    },

    async studentHistoryRows(studentId, fromIso, toExclusiveIso) {
      const rows = await db
        .select({
          id: attendanceRecords.id,
          dateIso: attendanceSessions.date,
          status: attendanceRecords.status,
          scannedAt: attendanceRecords.scannedAt,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          teacherName: users.fullName,
        })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceRecords.sessionId, attendanceSessions.id),
        )
        .innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id))
        .innerJoin(users, eq(attendanceSessions.teacherId, users.id))
        .where(
          and(
            eq(attendanceRecords.studentId, studentId),
            gte(attendanceSessions.date, fromIso),
            lt(attendanceSessions.date, toExclusiveIso),
          ),
        )
        .orderBy(desc(attendanceSessions.date), desc(attendanceRecords.scannedAt));
      return rows;
    },

    async teacherSessionRows(teacherId, fromIso, toExclusiveIso) {
      const rows = await db
        .select({
          sessionId: attendanceSessions.id,
          dateIso: attendanceSessions.date,
          className: classes.name,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          code: attendanceSessions.code,
        })
        .from(attendanceSessions)
        .innerJoin(classes, eq(attendanceSessions.classId, classes.id))
        .innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id))
        .where(
          and(
            eq(attendanceSessions.teacherId, teacherId),
            gte(attendanceSessions.date, fromIso),
            lt(attendanceSessions.date, toExclusiveIso),
          ),
        )
        .orderBy(desc(attendanceSessions.date));
      return rows;
    },

    async teacherStatusRows(teacherId, fromIso, toExclusiveIso) {
      const rows = await db
        .select({
          sessionId: attendanceRecords.sessionId,
          status: attendanceRecords.status,
        })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceRecords.sessionId, attendanceSessions.id),
        )
        .where(
          and(
            eq(attendanceSessions.teacherId, teacherId),
            gte(attendanceSessions.date, fromIso),
            lt(attendanceSessions.date, toExclusiveIso),
          ),
        );
      return rows;
    },

    async dailyStatusRows(fromIso, toExclusiveIso) {
      const rows = await db
        .select({
          dateIso: attendanceSessions.date,
          status: attendanceRecords.status,
        })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceRecords.sessionId, attendanceSessions.id),
        )
        .where(
          and(
            gte(attendanceSessions.date, fromIso),
            lt(attendanceSessions.date, toExclusiveIso),
          ),
        );
      return rows;
    },
  };
}
