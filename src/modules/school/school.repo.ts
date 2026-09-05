import {
  and,
  count,
  countDistinct,
  eq,
  ilike,
  not,
  or,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import type { Role } from "../../common/types.ts";
import {
  assignments,
  attendanceSessions,
  classes,
  classStudents,
  classSubjectTeacher,
  forumTopics,
  materials,
  schedules,
  subjects,
  users,
} from "../../db/schema.ts";

export interface ClassListRow {
  id: string;
  name: string;
  grade: number;
  academicYear: string;
  studentCount: number;
  subjectCount: number;
}

export interface SubjectListRow {
  id: string;
  code: string;
  name: string;
  usedCount: number;
}

export interface ManagedUserRow {
  id: string;
  fullName: string;
  email: string | null;
  emailHash: string | null;
  nisn: string | null;
  nisnHash: string | null;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  photoUrl: string | null;
  createdAt: Date;
}

export interface UserListFilter {
  role?: Role;
  q?: string;
  isActive?: boolean;
}

export interface MemberRef {
  id: string;
  name: string;
}

export interface SubjectTeacherRow {
  id: string;
  classId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
}

export interface SchoolStore {
  listClasses(filterId?: string): Promise<ClassListRow[]>;
  listSubjects(filterId?: string): Promise<SubjectListRow[]>;
  classNameExists(name: string, excludeId?: string): Promise<boolean>;
  subjectCodeExists(code: string, excludeId?: string): Promise<boolean>;
  insertClass(input: {
    name: string;
    grade: number;
    academicYear: string;
  }): Promise<{ id: string }>;
  updateClass(
    id: string,
    input: { name?: string; grade?: number; academicYear?: string },
  ): Promise<boolean>;
  deleteClass(id: string): Promise<boolean>;
  classInUse(id: string): Promise<{ section: string } | null>;
  insertSubject(input: { code: string; name: string }): Promise<{ id: string }>;
  updateSubject(
    id: string,
    input: { code?: string; name?: string },
  ): Promise<boolean>;
  deleteSubject(id: string): Promise<boolean>;
  subjectInUse(id: string): Promise<{ section: string } | null>;
  listUsers(
    filter?: UserListFilter,
    opts?: { limit?: number; offset?: number },
  ): Promise<ManagedUserRow[]>;
  countUsers(filter?: UserListFilter): Promise<number>;
  emailHashExists(emailHash: string, excludeId?: string): Promise<boolean>;
  nisnHashExists(nisnHash: string, excludeId?: string): Promise<boolean>;
  insertUser(input: {
    fullName: string;
    email: string | null;
    emailHash: string | null;
    nisn: string | null;
    nisnHash: string | null;
    passwordHash: string;
    role: Role;
  }): Promise<{ id: string }>;
  updateUser(
    id: string,
    input: Partial<{
      fullName: string;
      email: string | null;
      emailHash: string | null;
      nisn: string | null;
      nisnHash: string | null;
      passwordHash: string;
      role: Role;
      isActive: boolean;
    }>,
  ): Promise<boolean>;
  listClassStudents(classId: string): Promise<MemberRef[]>;
  listStudentCandidates(): Promise<MemberRef[]>;
  studentMembership(studentId: string): Promise<string | null>;
  studentInClass(classId: string, studentId: string): Promise<boolean>;
  addClassStudent(classId: string, studentId: string, entryYear: string): Promise<void>;
  removeClassStudent(classId: string, studentId: string): Promise<boolean>;
  updateStudentClass(studentId: string, classId: string): Promise<boolean>;
  listSubjectTeachers(classId: string): Promise<SubjectTeacherRow[]>;
  listAvailableSubjects(classId: string): Promise<MemberRef[]>;
  listTeacherCandidates(): Promise<MemberRef[]>;
  teacherAssignmentExists(classId: string, subjectId: string): Promise<boolean>;
  assignTeacher(classId: string, subjectId: string, teacherId: string): Promise<void>;
  changeTeacher(rowId: string, teacherId: string): Promise<boolean>;
  removeTeacherAssignment(rowId: string): Promise<boolean>;
}

function userConditions(filter: UserListFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.role) conditions.push(eq(users.role, filter.role));
  if (filter.isActive !== undefined) {
    conditions.push(eq(users.isActive, filter.isActive));
  }
  if (filter.q) {
    conditions.push(ilike(users.fullName, `%${filter.q.trim()}%`));
  }
  return conditions;
}

export function createSchoolStore(db: Database): SchoolStore {
  const classScopes: Array<{
    section: string;
    exists: (id: string) => Promise<boolean>;
  }> = [
    {
      section: "murid",
      exists: async (id) =>
        (await db.select({ id: classStudents.id }).from(classStudents).where(eq(classStudents.classId, id)).limit(1))
          .length > 0,
    },
    {
      section: "guru pengampu",
      exists: async (id) =>
        (await db.select({ id: classSubjectTeacher.id }).from(classSubjectTeacher).where(eq(classSubjectTeacher.classId, id)).limit(1))
          .length > 0,
    },
    {
      section: "jadwal",
      exists: async (id) =>
        (await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.classId, id)).limit(1))
          .length > 0,
    },
    {
      section: "sesi absensi",
      exists: async (id) =>
        (await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq(attendanceSessions.classId, id)).limit(1))
          .length > 0,
    },
    {
      section: "tugas",
      exists: async (id) =>
        (await db.select({ id: assignments.id }).from(assignments).where(eq(assignments.classId, id)).limit(1))
          .length > 0,
    },
    {
      section: "materi",
      exists: async (id) =>
        (await db.select({ id: materials.id }).from(materials).where(eq(materials.classId, id)).limit(1))
          .length > 0,
    },
    {
      section: "forum",
      exists: async (id) =>
        (await db.select({ id: forumTopics.id }).from(forumTopics).where(eq(forumTopics.classId, id)).limit(1))
          .length > 0,
    },
  ];

  const subjectScopes: Array<{
    section: string;
    exists: (id: string) => Promise<boolean>;
  }> = [
    {
      section: "guru pengampu",
      exists: async (id) =>
        (await db.select({ id: classSubjectTeacher.id }).from(classSubjectTeacher).where(eq(classSubjectTeacher.subjectId, id)).limit(1))
          .length > 0,
    },
    {
      section: "jadwal",
      exists: async (id) =>
        (await db.select({ id: schedules.id }).from(schedules).where(eq(schedules.subjectId, id)).limit(1))
          .length > 0,
    },
    {
      section: "tugas",
      exists: async (id) =>
        (await db.select({ id: assignments.id }).from(assignments).where(eq(assignments.subjectId, id)).limit(1))
          .length > 0,
    },
    {
      section: "sesi absensi",
      exists: async (id) =>
        (await db.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq(attendanceSessions.subjectId, id)).limit(1))
          .length > 0,
    },
    {
      section: "materi",
      exists: async (id) =>
        (await db.select({ id: materials.id }).from(materials).where(eq(materials.subjectId, id)).limit(1))
          .length > 0,
    },
    {
      section: "forum",
      exists: async (id) =>
        (await db.select({ id: forumTopics.id }).from(forumTopics).where(eq(forumTopics.subjectId, id)).limit(1))
          .length > 0,
    },
  ];

  return {
    async listClasses(filterId) {
      const condition = filterId ? eq(classes.id, filterId) : undefined;
      return db
        .select({
          id: classes.id,
          name: classes.name,
          grade: classes.grade,
          academicYear: classes.academicYear,
          studentCount: countDistinct(classStudents.studentId),
          subjectCount: countDistinct(classSubjectTeacher.subjectId),
        })
        .from(classes)
        .leftJoin(classStudents, eq(classStudents.classId, classes.id))
        .leftJoin(
          classSubjectTeacher,
          eq(classSubjectTeacher.classId, classes.id),
        )
        .where(condition)
        .groupBy(classes.id, classes.name, classes.grade, classes.academicYear)
        .orderBy(classes.name);
    },

    async listSubjects(filterId) {
      const condition = filterId ? eq(subjects.id, filterId) : undefined;
      return db
        .select({
          id: subjects.id,
          code: subjects.code,
          name: subjects.name,
          usedCount: countDistinct(classSubjectTeacher.id),
        })
        .from(subjects)
        .leftJoin(
          classSubjectTeacher,
          eq(classSubjectTeacher.subjectId, subjects.id),
        )
        .where(condition)
        .groupBy(subjects.id, subjects.code, subjects.name)
        .orderBy(subjects.name);
    },

    async classNameExists(name, excludeId) {
      const condition = excludeId
        ? and(eq(classes.name, name), not(eq(classes.id, excludeId)))
        : eq(classes.name, name);
      const [row] = await db
        .select({ id: classes.id })
        .from(classes)
        .where(condition)
        .limit(1);
      return row !== undefined;
    },

    async subjectCodeExists(code, excludeId) {
      const condition = excludeId
        ? and(eq(subjects.code, code), not(eq(subjects.id, excludeId)))
        : eq(subjects.code, code);
      const [row] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(condition)
        .limit(1);
      return row !== undefined;
    },

    async insertClass(input) {
      const [row] = await db
        .insert(classes)
        .values(input)
        .returning({ id: classes.id });
      if (!row) throw new Error("Gagal menyimpan kelas");
      return row;
    },

    async updateClass(id, input) {
      const result = await db
        .update(classes)
        .set(input)
        .where(eq(classes.id, id))
        .returning({ id: classes.id });
      return result.length > 0;
    },

    async deleteClass(id) {
      const result = await db
        .delete(classes)
        .where(eq(classes.id, id))
        .returning({ id: classes.id });
      return result.length > 0;
    },

    async classInUse(id) {
      for (const scope of classScopes) {
        if (await scope.exists(id)) return { section: scope.section };
      }
      return null;
    },

    async insertSubject(input) {
      const [row] = await db
        .insert(subjects)
        .values(input)
        .returning({ id: subjects.id });
      if (!row) throw new Error("Gagal menyimpan mata pelajaran");
      return row;
    },

    async updateSubject(id, input) {
      const result = await db
        .update(subjects)
        .set(input)
        .where(eq(subjects.id, id))
        .returning({ id: subjects.id });
      return result.length > 0;
    },

    async deleteSubject(id) {
      const result = await db
        .delete(subjects)
        .where(eq(subjects.id, id))
        .returning({ id: subjects.id });
      return result.length > 0;
    },

    async subjectInUse(id) {
      for (const scope of subjectScopes) {
        if (await scope.exists(id)) return { section: scope.section };
      }
      return null;
    },

    async listUsers(filter = {}, opts = {}) {
      const conditions = userConditions(filter);
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const query = db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          emailHash: users.emailHash,
          nisn: users.nisn,
          nisnHash: users.nisnHash,
          passwordHash: users.passwordHash,
          role: users.role,
          isActive: users.isActive,
          photoUrl: users.photoUrl,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(users.fullName);
      if (opts.limit !== undefined) query.limit(opts.limit);
      if (opts.offset !== undefined) query.offset(opts.offset);
      return query;
    },

    async countUsers(filter = {}) {
      const conditions = userConditions(filter);
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [row] = await db
        .select({ n: count(users.id) })
        .from(users)
        .where(where);
      return row?.n ?? 0;
    },

    async emailHashExists(emailHash, excludeId) {
      const condition = excludeId
        ? and(eq(users.emailHash, emailHash), not(eq(users.id, excludeId)))
        : eq(users.emailHash, emailHash);
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(condition)
        .limit(1);
      return row !== undefined;
    },

    async nisnHashExists(nisnHash, excludeId) {
      const condition = excludeId
        ? and(eq(users.nisnHash, nisnHash), not(eq(users.id, excludeId)))
        : eq(users.nisnHash, nisnHash);
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(condition)
        .limit(1);
      return row !== undefined;
    },

    async insertUser(input) {
      const [row] = await db
        .insert(users)
        .values(input)
        .returning({ id: users.id });
      if (!row) throw new Error("Gagal menyimpan pengguna");
      return row;
    },

    async updateUser(id, input) {
      const result = await db
        .update(users)
        .set(input)
        .where(eq(users.id, id))
        .returning({ id: users.id });
      return result.length > 0;
    },

    async listClassStudents(classId) {
      return db
        .select({ id: users.id, name: users.fullName })
        .from(classStudents)
        .innerJoin(users, eq(classStudents.studentId, users.id))
        .where(eq(classStudents.classId, classId))
        .orderBy(users.fullName);
    },

    async listStudentCandidates() {
      const enrolled = await db
        .select({ studentId: classStudents.studentId })
        .from(classStudents);
      const taken = new Set(enrolled.map((row) => row.studentId));
      const rows = await db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(eq(users.role, "murid"))
        .orderBy(users.fullName);
      return rows.filter((row) => !taken.has(row.id));
    },

    async studentMembership(studentId) {
      const [row] = await db
        .select({ classId: classStudents.classId })
        .from(classStudents)
        .where(eq(classStudents.studentId, studentId))
        .limit(1);
      return row?.classId ?? null;
    },

    async studentInClass(classId, studentId) {
      const [row] = await db
        .select({ id: classStudents.id })
        .from(classStudents)
        .where(
          and(
            eq(classStudents.classId, classId),
            eq(classStudents.studentId, studentId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async addClassStudent(classId, studentId, entryYear) {
      const [row] = await db
        .insert(classStudents)
        .values({ classId, studentId, entryYear })
        .returning({ id: classStudents.id });
      if (!row) throw new Error("Gagal menambahkan murid ke kelas");
    },

    async removeClassStudent(classId, studentId) {
      const result = await db
        .delete(classStudents)
        .where(
          and(
            eq(classStudents.classId, classId),
            eq(classStudents.studentId, studentId),
          ),
        )
        .returning({ id: classStudents.id });
      return result.length > 0;
    },

    async updateStudentClass(studentId, classId) {
      const result = await db
        .update(classStudents)
        .set({ classId })
        .where(eq(classStudents.studentId, studentId))
        .returning({ id: classStudents.id });
      return result.length > 0;
    },

    async listSubjectTeachers(classId) {
      return db
        .select({
          id: classSubjectTeacher.id,
          classId: classSubjectTeacher.classId,
          subjectId: classSubjectTeacher.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          teacherId: classSubjectTeacher.teacherId,
          teacherName: users.fullName,
        })
        .from(classSubjectTeacher)
        .innerJoin(subjects, eq(classSubjectTeacher.subjectId, subjects.id))
        .innerJoin(users, eq(classSubjectTeacher.teacherId, users.id))
        .where(eq(classSubjectTeacher.classId, classId))
        .orderBy(subjects.name);
    },

    async listAvailableSubjects(classId) {
      const assignedRows = await db
        .select({ subjectId: classSubjectTeacher.subjectId })
        .from(classSubjectTeacher)
        .where(eq(classSubjectTeacher.classId, classId));
      const taken = new Set(assignedRows.map((row) => row.subjectId));
      const rows = await db
        .select({ id: subjects.id, name: subjects.name })
        .from(subjects)
        .orderBy(subjects.name);
      return rows.filter((row) => !taken.has(row.id));
    },

    async listTeacherCandidates() {
      return db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(eq(users.role, "guru"))
        .orderBy(users.fullName);
    },

    async teacherAssignmentExists(classId, subjectId) {
      const [row] = await db
        .select({ id: classSubjectTeacher.id })
        .from(classSubjectTeacher)
        .where(
          and(
            eq(classSubjectTeacher.classId, classId),
            eq(classSubjectTeacher.subjectId, subjectId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async assignTeacher(classId, subjectId, teacherId) {
      const [row] = await db
        .insert(classSubjectTeacher)
        .values({ classId, subjectId, teacherId })
        .returning({ id: classSubjectTeacher.id });
      if (!row) throw new Error("Gagal menetapkan guru pengampu");
    },

    async changeTeacher(rowId, teacherId) {
      const result = await db
        .update(classSubjectTeacher)
        .set({ teacherId })
        .where(eq(classSubjectTeacher.id, rowId))
        .returning({ id: classSubjectTeacher.id });
      return result.length > 0;
    },

    async removeTeacherAssignment(rowId) {
      const result = await db
        .delete(classSubjectTeacher)
        .where(eq(classSubjectTeacher.id, rowId))
        .returning({ id: classSubjectTeacher.id });
      return result.length > 0;
    },
  };
}
