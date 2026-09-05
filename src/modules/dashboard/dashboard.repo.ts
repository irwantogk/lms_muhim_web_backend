import { and, count, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Role } from "../../common/types.ts";
import type { Database } from "../../db/index.ts";
import {
  assignmentSubmissions,
  assignments,
  attendanceRecords,
  attendanceSessions,
  classes,
  classStudents,
  classSubjectTeacher,
  parentStudents,
  schedules,
  subjects,
  users,
} from "../../db/schema.ts";

export type AttendanceStatus = "hadir" | "terlambat" | "izin" | "sakit";
export type AssignmentType = "pilihan_ganda" | "esai" | "upload" | "campuran";

export interface StudentRow {
  id: string;
  name: string;
  role: Role;
  classId: string | null;
  className: string | null;
}

export interface TeacherRow {
  id: string;
  name: string;
  role: Role;
}

export interface ParentRow {
  id: string;
  name: string;
  role: Role;
}

export interface ChildRow {
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
}

export interface StatusCounts {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  total: number;
}

export interface TaskProgress {
  totalTasks: number;
  tasksDone: number;
  avgScore: number;
}

export interface SchoolCounts {
  totalUsers: number;
  admins: number;
  gurus: number;
  murids: number;
  orangTuas: number;
  classes: number;
  subjects: number;
}

export interface AttendanceByDateRow {
  date: string;
  status: AttendanceStatus;
}

export interface ScheduleJoinRow {
  scheduleId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  startTime: string;
  endTime: string;
}

export interface SessionRow {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  code: string;
}

export interface RecordRow {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
}

export interface AssignmentRow {
  id: string;
  title: string;
  className: string;
  subjectName: string;
  type: AssignmentType;
  deadline: Date;
}

export interface GradingRow {
  assignmentId: string;
  title: string;
  className: string;
  subjectName: string;
  deadline: Date;
  pending: number;
}

export interface DashboardRepository {
  findStudentById(studentId: string): Promise<StudentRow | null>;
  findTeacherById(teacherId: string): Promise<TeacherRow | null>;
  findParentById(parentId: string): Promise<ParentRow | null>;
  childrenOfParent(parentId: string): Promise<ChildRow[]>;
  scheduleForClassOnDay(classId: string, dayOfWeek: number): Promise<ScheduleJoinRow[]>;
  scheduleForTeacherOnDay(teacherId: string, dayOfWeek: number): Promise<ScheduleJoinRow[]>;
  sessionsOnDate(dateStr: string): Promise<SessionRow[]>;
  recordsOnDate(dateStr: string): Promise<RecordRow[]>;
  studentCountInClass(classId: string): Promise<number>;
  monthlyAttendanceCounts(
    studentId: string,
    monthStartIso: string,
    monthEndExclusiveIso: string,
  ): Promise<StatusCounts>;
  studentTaskProgress(classId: string, studentId: string): Promise<TaskProgress>;
  getSchoolCounts(): Promise<SchoolCounts>;
  attendanceRecordsBetween(
    startIso: string,
    endExclusiveIso: string,
  ): Promise<AttendanceByDateRow[]>;
  assignmentsForClass(classId: string): Promise<AssignmentRow[]>;
  pendingGradingForTeacher(teacherId: string): Promise<GradingRow[]>;
}

export function createDashboardRepository(db: Database): DashboardRepository {
  return {
    async findStudentById(studentId) {
      const [user] = await db
        .select({
          id: users.id,
          name: users.fullName,
          role: users.role,
        })
        .from(users)
        .where(and(eq(users.id, studentId), eq(users.role, "murid")))
        .limit(1);
      if (!user) return null;

      const [membership] = await db
        .select({
          classId: classStudents.classId,
          className: classes.name,
        })
        .from(classStudents)
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(classStudents.studentId, studentId))
        .limit(1);

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        classId: membership?.classId ?? null,
        className: membership?.className ?? null,
      };
    },

    async findTeacherById(teacherId) {
      const [teacher] = await db
        .select({
          id: users.id,
          name: users.fullName,
          role: users.role,
        })
        .from(users)
        .where(and(eq(users.id, teacherId), eq(users.role, "guru")))
        .limit(1);
      return teacher ?? null;
    },

    async findParentById(parentId) {
      const [parent] = await db
        .select({
          id: users.id,
          name: users.fullName,
          role: users.role,
        })
        .from(users)
        .where(and(eq(users.id, parentId), eq(users.role, "orang_tua")))
        .limit(1);
      return parent ?? null;
    },

    async childrenOfParent(parentId) {
      const rows = await db
        .select({
          studentId: users.id,
          studentName: users.fullName,
          className: classes.name,
          classId: classStudents.classId,
        })
        .from(parentStudents)
        .innerJoin(users, eq(parentStudents.studentId, users.id))
        .innerJoin(
          classStudents,
          eq(classStudents.studentId, parentStudents.studentId),
        )
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(parentStudents.parentId, parentId));
      return rows;
    },

    async scheduleForClassOnDay(classId, dayOfWeek) {
      return db
        .select({
          scheduleId: schedules.id,
          classId: schedules.classId,
          className: classes.name,
          subjectId: subjects.id,
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
    },

    async scheduleForTeacherOnDay(teacherId, dayOfWeek) {
      return db
        .select({
          scheduleId: schedules.id,
          classId: schedules.classId,
          className: classes.name,
          subjectId: subjects.id,
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
            eq(classSubjectTeacher.teacherId, teacherId),
            eq(schedules.dayOfWeek, dayOfWeek),
          ),
        )
        .orderBy(schedules.startTime);
    },

    async sessionsOnDate(dateStr) {
      return db
        .select({
          id: attendanceSessions.id,
          classId: attendanceSessions.classId,
          subjectId: attendanceSessions.subjectId,
          teacherId: attendanceSessions.teacherId,
          code: attendanceSessions.code,
        })
        .from(attendanceSessions)
        .where(eq(attendanceSessions.date, dateStr));
    },

    async recordsOnDate(dateStr) {
      const rows = await db
        .select({
          sessionId: attendanceRecords.sessionId,
          studentId: attendanceRecords.studentId,
          status: attendanceRecords.status,
        })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceRecords.sessionId, attendanceSessions.id),
        )
        .where(eq(attendanceSessions.date, dateStr));
      return rows;
    },

    async studentCountInClass(classId) {
      const [row] = await db
        .select({ total: count(classStudents.id) })
        .from(classStudents)
        .where(eq(classStudents.classId, classId));
      return row?.total ?? 0;
    },

    async monthlyAttendanceCounts(studentId, monthStartIso, monthEndExclusiveIso) {
      const rows = await db
        .select({ status: attendanceRecords.status })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceRecords.sessionId, attendanceSessions.id),
        )
        .where(
          and(
            eq(attendanceRecords.studentId, studentId),
            gte(attendanceSessions.date, monthStartIso),
            lt(attendanceSessions.date, monthEndExclusiveIso),
          ),
        );

      const counts: StatusCounts = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, total: 0 };
      for (const row of rows) {
        counts[row.status] += 1;
      }
      counts.total = rows.length;
      return counts;
    },

    async studentTaskProgress(classId, studentId) {
      const [totalRow] = await db
        .select({ n: count(assignments.id) })
        .from(assignments)
        .where(eq(assignments.classId, classId));
      const totalTasks = totalRow?.n ?? 0;

      const [doneRow] = await db
        .select({ n: count(assignmentSubmissions.id) })
        .from(assignmentSubmissions)
        .innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id))
        .where(
          and(
            eq(assignmentSubmissions.studentId, studentId),
            eq(assignments.classId, classId),
          ),
        );
      const tasksDone = doneRow?.n ?? 0;

      const [avgRow] = await db
        .select({ avg: sql<string>`avg(${assignmentSubmissions.score})` })
        .from(assignmentSubmissions)
        .innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id))
        .where(
          and(
            eq(assignmentSubmissions.studentId, studentId),
            eq(assignments.classId, classId),
            isNotNull(assignmentSubmissions.gradedAt),
            isNotNull(assignmentSubmissions.score),
          ),
        );

      const avgScore = avgRow?.avg == null ? 0 : Math.round(Number(avgRow.avg));

      return { totalTasks, tasksDone, avgScore };
    },

    async getSchoolCounts() {
      const roleCount = async (role: Role) => {
        const [row] = await db
          .select({ n: count(users.id) })
          .from(users)
          .where(eq(users.role, role));
        return row?.n ?? 0;
      };
      const countRows = async (table: typeof classes | typeof subjects) => {
        const [row] = await db.select({ n: count(table.id) }).from(table);
        return row?.n ?? 0;
      };

      const [admins, gurus, murids, orangTuas, classTotal, subjectTotal] =
        await Promise.all([
          roleCount("admin"),
          roleCount("guru"),
          roleCount("murid"),
          roleCount("orang_tua"),
          countRows(classes),
          countRows(subjects),
        ]);

      const totalUsers = admins + gurus + murids + orangTuas;
      return {
        totalUsers,
        admins,
        gurus,
        murids,
        orangTuas,
        classes: classTotal,
        subjects: subjectTotal,
      };
    },

    async attendanceRecordsBetween(startIso, endExclusiveIso) {
      const rows = await db
        .select({
          date: attendanceSessions.date,
          status: attendanceRecords.status,
        })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceRecords.sessionId, attendanceSessions.id),
        )
        .where(
          and(
            gte(attendanceSessions.date, startIso),
            lt(attendanceSessions.date, endExclusiveIso),
          ),
        );
      return rows;
    },

    async assignmentsForClass(classId) {
      const rows = await db
        .select({
          id: assignments.id,
          title: assignments.title,
          className: classes.name,
          subjectName: subjects.name,
          type: assignments.type,
          deadline: assignments.deadline,
        })
        .from(assignments)
        .innerJoin(classes, eq(assignments.classId, classes.id))
        .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
        .where(eq(assignments.classId, classId))
        .orderBy(assignments.deadline);
      return rows.map((row) => ({ ...row, deadline: new Date(row.deadline) }));
    },

    async pendingGradingForTeacher(teacherId) {
      const rows = await db
        .select({
          assignmentId: assignments.id,
          title: assignments.title,
          className: classes.name,
          subjectName: subjects.name,
          deadline: assignments.deadline,
          pending: count(assignmentSubmissions.id),
        })
        .from(assignments)
        .innerJoin(classes, eq(assignments.classId, classes.id))
        .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
        .leftJoin(
          assignmentSubmissions,
          and(
            eq(assignmentSubmissions.assignmentId, assignments.id),
            isNull(assignmentSubmissions.gradedAt),
          ),
        )
        .where(eq(assignments.teacherId, teacherId))
        .groupBy(
          assignments.id,
          assignments.title,
          classes.name,
          subjects.name,
          assignments.deadline,
        )
        .having(sql`count(${assignmentSubmissions.id}) > 0`)
        .orderBy(assignments.deadline);
      return rows.map((row) => ({ ...row, deadline: new Date(row.deadline) }));
    },
  };
}
