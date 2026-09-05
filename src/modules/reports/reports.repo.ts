import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
} from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import {
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  attendanceSessions,
  classes,
  classStudents,
  classSubjectTeacher,
  subjects,
  users,
} from "../../db/schema.ts";

export type AttendanceStatus = "hadir" | "terlambat" | "izin" | "sakit";

export interface ComboRow {
  classId: string;
  className: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
}

export interface StudentClassRow {
  classId: string;
  className: string;
}

export interface NilaiRekapRow {
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  taskCount: number;
  gradedCount: number;
  avg: number | null;
  highest: number | null;
  lowest: number | null;
}

export interface AbsenStatusRow {
  classId: string;
  className: string;
  subjectCode: string;
  subjectName: string;
  status: AttendanceStatus;
}

export interface StudentMemberRow {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
}

export interface AssignmentTotalRow {
  classId: string;
  subjectCode: string;
  subjectName: string;
  total: number;
}

export interface MemberSubmissionRow {
  studentId: string;
  subjectCode: string;
  subjectName: string;
  score: number | null;
  gradedAt: Date | null;
}

export interface MemberAbsenceRow {
  studentId: string;
  classId: string;
  subjectCode: string;
  status: AttendanceStatus;
}

export interface ReportsStore {
  studentClass(studentId: string): Promise<StudentClassRow | null>;
  combosByTeacher(teacherId: string): Promise<ComboRow[]>;
  combosAll(): Promise<ComboRow[]>;
  rekapNilai(classIds: string[]): Promise<NilaiRekapRow[]>;
  absenceStatusRows(
    classIds: string[],
    fromIso: string,
    toExclusiveIso: string,
  ): Promise<AbsenStatusRow[]>;
  classMembers(classIds: string[]): Promise<StudentMemberRow[]>;
  assignmentTotalsForClasses(classIds: string[]): Promise<AssignmentTotalRow[]>;
  submissionRowsForMembers(
    studentIds: string[],
    classIds: string[],
  ): Promise<MemberSubmissionRow[]>;
  absenceRowsForMembers(
    classIds: string[],
    fromIso: string,
    toExclusiveIso: string,
  ): Promise<MemberAbsenceRow[]>;
}

function toNumber(value: string | null): number | null {
  return value == null ? null : Number(value);
}

export function createReportsStore(db: Database): ReportsStore {
  return {
    async studentClass(studentId) {
      const [row] = await db
        .select({
          classId: classStudents.classId,
          className: classes.name,
        })
        .from(classStudents)
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(classStudents.studentId, studentId))
        .limit(1);
      return row ?? null;
    },

    async combosByTeacher(teacherId) {
      return db
        .select({
          classId: classSubjectTeacher.classId,
          className: classes.name,
          subjectId: classSubjectTeacher.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
        })
        .from(classSubjectTeacher)
        .innerJoin(classes, eq(classSubjectTeacher.classId, classes.id))
        .innerJoin(subjects, eq(classSubjectTeacher.subjectId, subjects.id))
        .where(eq(classSubjectTeacher.teacherId, teacherId))
        .orderBy(classes.name, subjects.name);
    },

    async combosAll() {
      return db
        .select({
          classId: classSubjectTeacher.classId,
          className: classes.name,
          subjectId: classSubjectTeacher.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
        })
        .from(classSubjectTeacher)
        .innerJoin(classes, eq(classSubjectTeacher.classId, classes.id))
        .innerJoin(subjects, eq(classSubjectTeacher.subjectId, subjects.id))
        .orderBy(classes.name, subjects.name);
    },

    async rekapNilai(classIds) {
      if (classIds.length === 0) return [];
      const subs = assignmentSubmissions;
      const rows = await db
        .select({
          classId: assignments.classId,
          className: classes.name,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          taskCount: countDistinct(assignments.id),
          gradedCount: count(subs.id),
          avg: sql<string>`avg(${subs.score})`,
          highest: sql<string>`max(${subs.score})`,
          lowest: sql<string>`min(${subs.score})`,
        })
        .from(assignments)
        .innerJoin(classes, eq(assignments.classId, classes.id))
        .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
        .leftJoin(
          subs,
          and(
            eq(subs.assignmentId, assignments.id),
            isNotNull(subs.gradedAt),
            isNotNull(subs.score),
          ),
        )
        .where(inArray(assignments.classId, classIds))
        .groupBy(
          assignments.classId,
          classes.name,
          assignments.subjectId,
          subjects.code,
          subjects.name,
        )
        .orderBy(classes.name, subjects.name);
      return rows.map((row) => ({
        classId: row.classId,
        className: row.className,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        taskCount: row.taskCount,
        gradedCount: row.gradedCount,
        avg: toNumber(row.avg ?? null),
        highest: toNumber(row.highest ?? null),
        lowest: toNumber(row.lowest ?? null),
      }));
    },

    async absenceStatusRows(classIds, fromIso, toExclusiveIso) {
      if (classIds.length === 0) return [];
      return db
        .select({
          classId: attendanceSessions.classId,
          className: classes.name,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          status: attendanceRecords.status,
        })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceRecords.sessionId, attendanceSessions.id),
        )
        .innerJoin(classes, eq(attendanceSessions.classId, classes.id))
        .innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id))
        .where(
          and(
            inArray(attendanceSessions.classId, classIds),
            gte(attendanceSessions.date, fromIso),
            lt(attendanceSessions.date, toExclusiveIso),
          ),
        );
    },

    async classMembers(classIds) {
      if (classIds.length === 0) return [];
      return db
        .select({
          studentId: classStudents.studentId,
          studentName: users.fullName,
          classId: classStudents.classId,
          className: classes.name,
        })
        .from(classStudents)
        .innerJoin(users, eq(classStudents.studentId, users.id))
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(inArray(classStudents.classId, classIds))
        .orderBy(classes.name, users.fullName);
    },

    async assignmentTotalsForClasses(classIds) {
      if (classIds.length === 0) return [];
      return db
        .select({
          classId: assignments.classId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          total: count(assignments.id),
        })
        .from(assignments)
        .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
        .where(inArray(assignments.classId, classIds))
        .groupBy(assignments.classId, subjects.code, subjects.name)
        .orderBy(assignments.classId, subjects.name);
    },

    async submissionRowsForMembers(studentIds, classIds) {
      if (studentIds.length === 0 || classIds.length === 0) return [];
      const rows = await db
        .select({
          studentId: assignmentSubmissions.studentId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          score: assignmentSubmissions.score,
          gradedAt: assignmentSubmissions.gradedAt,
        })
        .from(assignmentSubmissions)
        .innerJoin(
          assignments,
          eq(assignmentSubmissions.assignmentId, assignments.id),
        )
        .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
        .where(
          and(
            inArray(assignmentSubmissions.studentId, studentIds),
            inArray(assignments.classId, classIds),
          ),
        );
      return rows.map((row) => ({
        studentId: row.studentId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        score: row.score == null ? null : Number(row.score),
        gradedAt: row.gradedAt == null ? null : new Date(row.gradedAt),
      }));
    },

    async absenceRowsForMembers(classIds, fromIso, toExclusiveIso) {
      if (classIds.length === 0) return [];
      return db
        .select({
          studentId: attendanceRecords.studentId,
          classId: attendanceSessions.classId,
          subjectCode: subjects.code,
          status: attendanceRecords.status,
        })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceRecords.sessionId, attendanceSessions.id),
        )
        .innerJoin(subjects, eq(attendanceSessions.subjectId, subjects.id))
        .where(
          and(
            inArray(attendanceSessions.classId, classIds),
            gte(attendanceSessions.date, fromIso),
            lt(attendanceSessions.date, toExclusiveIso),
          ),
        );
    },
  };
}
