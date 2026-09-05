import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import {
  attendanceRecords,
  attendanceSessions,
  classes,
  classStudents,
  classSubjectTeacher,
  subjects,
} from "../../db/schema.ts";

export interface CreateSessionInput {
  classId: string;
  subjectId: string;
  teacherId: string;
  code: string;
  date: string;
  expiresAt: Date;
}

export interface SessionOptionRow {
  classId: string;
  className: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
}

export interface SessionRowJoined {
  id: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  code: string;
  createdAt: Date;
  expiresAt: Date;
  classId?: string;
}

export interface AttendanceRepository {
  teaches(classId: string, subjectId: string, teacherId: string): Promise<boolean>;
  optionsForTeacher(teacherId: string): Promise<SessionOptionRow[]>;
  codeExists(code: string): Promise<boolean>;
  createSession(input: CreateSessionInput): Promise<{ id: string }>;
  closeSession(
    sessionId: string,
    teacherId: string,
    closedAt: Date,
  ): Promise<boolean>;
  sessionsForTeacherOnDate(teacherId: string, date: string): Promise<SessionRowJoined[]>;
  sessionByCode(code: string): Promise<SessionRowJoined | null>;
  studentInClass(studentId: string, classId: string): Promise<boolean>;
  attendanceExists(sessionId: string, studentId: string): Promise<boolean>;
  createAttendanceRecord(
    sessionId: string,
    studentId: string,
    scannedAt: Date,
  ): Promise<void>;
}

export function createAttendanceRepository(db: Database): AttendanceRepository {
  return {
    async teaches(classId, subjectId, teacherId) {
      const [row] = await db
        .select({ id: classSubjectTeacher.id })
        .from(classSubjectTeacher)
        .where(
          and(
            eq(classSubjectTeacher.classId, classId),
            eq(classSubjectTeacher.subjectId, subjectId),
            eq(classSubjectTeacher.teacherId, teacherId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async optionsForTeacher(teacherId) {
      const rows = await db
        .select({
          classId: classes.id,
          className: classes.name,
          subjectId: subjects.id,
          subjectCode: subjects.code,
          subjectName: subjects.name,
        })
        .from(classSubjectTeacher)
        .innerJoin(classes, eq(classSubjectTeacher.classId, classes.id))
        .innerJoin(subjects, eq(classSubjectTeacher.subjectId, subjects.id))
        .where(eq(classSubjectTeacher.teacherId, teacherId))
        .orderBy(classes.name, subjects.code);
      return rows;
    },

    async codeExists(code) {
      const [row] = await db
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(eq(attendanceSessions.code, code))
        .limit(1);
      return row !== undefined;
    },

    async createSession(input) {
      const [row] = await db
        .insert(attendanceSessions)
        .values({
          classId: input.classId,
          subjectId: input.subjectId,
          teacherId: input.teacherId,
          code: input.code,
          date: input.date,
          expiresAt: input.expiresAt,
        })
        .returning({ id: attendanceSessions.id });
      if (!row) throw new Error("Gagal menyimpan sesi presensi");
      return row;
    },

    async closeSession(sessionId, teacherId, closedAt) {
      const result = await db
        .update(attendanceSessions)
        .set({ expiresAt: closedAt })
        .where(
          and(
            eq(attendanceSessions.id, sessionId),
            eq(attendanceSessions.teacherId, teacherId),
          ),
        )
        .returning({ id: attendanceSessions.id });
      return result.length > 0;
    },

    async sessionsForTeacherOnDate(teacherId, date) {
      const rows = await db
        .select({
          id: attendanceSessions.id,
          className: classes.name,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          code: attendanceSessions.code,
          createdAt: attendanceSessions.createdAt,
          expiresAt: attendanceSessions.expiresAt,
        })
        .from(attendanceSessions)
        .innerJoin(classes, eq(attendanceSessions.classId, classes.id))
        .innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id))
        .where(
          and(
            eq(attendanceSessions.teacherId, teacherId),
            eq(attendanceSessions.date, date),
          ),
        )
        .orderBy(desc(attendanceSessions.createdAt));

      return rows.map((row) => ({
        id: row.id,
        className: row.className,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        code: row.code,
        createdAt: new Date(row.createdAt),
        expiresAt: new Date(row.expiresAt),
      }));
    },

    async sessionByCode(code) {
      const [row] = await db
        .select({
          id: attendanceSessions.id,
          className: classes.name,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          code: attendanceSessions.code,
          createdAt: attendanceSessions.createdAt,
          expiresAt: attendanceSessions.expiresAt,
          classId: attendanceSessions.classId,
        })
        .from(attendanceSessions)
        .innerJoin(classes, eq(attendanceSessions.classId, classes.id))
        .innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id))
        .where(eq(attendanceSessions.code, code))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        className: row.className,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        code: row.code,
        createdAt: new Date(row.createdAt),
        expiresAt: new Date(row.expiresAt),
        classId: row.classId,
      };
    },

    async studentInClass(studentId, classId) {
      const [row] = await db
        .select({ id: classStudents.id })
        .from(classStudents)
        .where(
          and(
            eq(classStudents.studentId, studentId),
            eq(classStudents.classId, classId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async attendanceExists(sessionId, studentId) {
      const [row] = await db
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.sessionId, sessionId),
            eq(attendanceRecords.studentId, studentId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async createAttendanceRecord(sessionId, studentId, scannedAt) {
      await db.insert(attendanceRecords).values({
        sessionId,
        studentId,
        status: "hadir",
        scannedAt,
      });
    },
  };
}
