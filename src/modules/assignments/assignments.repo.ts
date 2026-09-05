import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import {
  assignmentSubmissions,
  assignments,
  classes,
  subjects,
  users,
} from "../../db/schema.ts";

export type AssignmentKind = "pilihan_ganda" | "esai" | "upload" | "campuran";

export type AssignmentQuestionRow =
  | {
      kind?: "pilihan_ganda";
      text: string;
      options: string[];
      multiple?: boolean;
      correct: number | number[];
    }
  | { kind: "esai"; text: string };

export interface AssignmentRow {
  id: string;
  className: string;
  classId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  title: string;
  instruction: string;
  type: AssignmentKind;
  questions: AssignmentQuestionRow[] | null;
  deadline: Date;
  createdAt: Date;
}

export interface InsertAssignmentInput {
  classId: string;
  subjectId: string;
  teacherId: string;
  title: string;
  instruction: string;
  type: AssignmentKind;
  questions: AssignmentQuestionRow[] | null;
  deadline: Date;
}

export interface AssignmentsStore {
  insertAssignment(input: InsertAssignmentInput): Promise<{ id: string }>;
  assignmentById(id: string): Promise<AssignmentRow | null>;
  listByClassIds(classIds: string[]): Promise<AssignmentRow[]>;
  submissionExists(assignmentId: string, studentId: string): Promise<boolean>;
  insertSubmission(input: {
    assignmentId: string;
    studentId: string;
    answer: unknown;
    submittedAt: Date;
  }): Promise<{ id: string }>;
  updateGrade(
    submissionId: string,
    input: { score: number; feedback: string | null; gradedAt: Date },
  ): Promise<boolean>;
  submissionsByAssignment(assignmentId: string): Promise<Array<{
    id: string;
    assignmentId: string;
    studentId: string;
    studentName: string;
    answer: unknown;
    score: number | null;
    feedback: string | null;
    submittedAt: Date;
  }>>;
  gradesForStudent(studentId: string): Promise<Array<{
    submissionId: string;
    assignmentId: string;
    title: string;
    className: string;
    subjectCode: string;
    subjectName: string;
    type: AssignmentKind;
    deadline: Date;
    submittedAt: Date;
    score: number | null;
    feedback: string | null;
    gradedAt: Date | null;
  }>>;
}

const selectBase = {
  id: assignments.id,
  className: classes.name,
  classId: assignments.classId,
  subjectId: assignments.subjectId,
  subjectCode: subjects.code,
  subjectName: subjects.name,
  title: assignments.title,
  instruction: assignments.instruction,
  type: assignments.type,
  questions: assignments.questions,
  deadline: assignments.deadline,
  createdAt: assignments.createdAt,
};

function toRow(row: {
  id: string;
  className: string;
  classId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  title: string;
  instruction: string | null;
  type: AssignmentKind;
  questions: unknown;
  deadline: Date;
  createdAt: Date;
}): AssignmentRow {
  return {
    id: row.id,
    className: row.className,
    classId: row.classId,
    subjectId: row.subjectId,
    subjectCode: row.subjectCode,
    subjectName: row.subjectName,
    title: row.title,
    instruction: row.instruction ?? "",
    type: row.type,
    questions: (row.questions ?? null) as AssignmentQuestionRow[] | null,
    deadline: new Date(row.deadline),
    createdAt: new Date(row.createdAt),
  };
}

export function createAssignmentsStore(db: Database): AssignmentsStore {
  return {
    async insertAssignment(input) {
      const [row] = await db
        .insert(assignments)
        .values({
          classId: input.classId,
          subjectId: input.subjectId,
          teacherId: input.teacherId,
          title: input.title,
          instruction: input.instruction,
          type: input.type,
          questions: input.questions,
          deadline: input.deadline,
        })
        .returning({ id: assignments.id });
      if (!row) throw new Error("Gagal menyimpan tugas");
      return row;
    },

    async assignmentById(id) {
      const [row] = await db
        .select(selectBase)
        .from(assignments)
        .innerJoin(classes, eq(assignments.classId, classes.id))
        .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
        .where(eq(assignments.id, id))
        .limit(1);
      return row ? toRow(row) : null;
    },

    async listByClassIds(classIds) {
      if (classIds.length === 0) return [];
      const rows = await db
        .select(selectBase)
        .from(assignments)
        .innerJoin(classes, eq(assignments.classId, classes.id))
        .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
        .where(inArray(assignments.classId, classIds))
        .orderBy(desc(assignments.deadline));
      return rows.map(toRow);
    },

    async submissionExists(assignmentId, studentId) {
      const [row] = await db
        .select({ id: assignmentSubmissions.id })
        .from(assignmentSubmissions)
        .where(
          and(
            eq(assignmentSubmissions.assignmentId, assignmentId),
            eq(assignmentSubmissions.studentId, studentId),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async insertSubmission(input) {
      const [row] = await db
        .insert(assignmentSubmissions)
        .values({
          assignmentId: input.assignmentId,
          studentId: input.studentId,
          answer: input.answer,
          submittedAt: input.submittedAt,
        })
        .returning({ id: assignmentSubmissions.id });
      if (!row) throw new Error("Gagal menyimpan jawaban");
      return row;
    },

    async updateGrade(submissionId, input) {
      const result = await db
        .update(assignmentSubmissions)
        .set({
          score: String(input.score),
          feedback: input.feedback,
          gradedAt: input.gradedAt,
        })
        .where(eq(assignmentSubmissions.id, submissionId))
        .returning({ id: assignmentSubmissions.id });
      return result.length > 0;
    },

    async submissionsByAssignment(assignmentId) {
      const rows = await db
        .select({
          id: assignmentSubmissions.id,
          assignmentId: assignmentSubmissions.assignmentId,
          studentId: assignmentSubmissions.studentId,
          studentName: users.fullName,
          answer: assignmentSubmissions.answer,
          score: assignmentSubmissions.score,
          feedback: assignmentSubmissions.feedback,
          submittedAt: assignmentSubmissions.submittedAt,
        })
        .from(assignmentSubmissions)
        .innerJoin(users, eq(assignmentSubmissions.studentId, users.id))
        .where(eq(assignmentSubmissions.assignmentId, assignmentId))
        .orderBy(desc(assignmentSubmissions.submittedAt));
      return rows.map((row) => ({
        id: row.id,
        assignmentId: row.assignmentId,
        studentId: row.studentId,
        studentName: row.studentName,
        answer: row.answer ?? null,
        score: row.score == null ? null : Number(row.score),
        feedback: row.feedback,
        submittedAt: new Date(row.submittedAt),
      }));
    },

    async gradesForStudent(studentId) {
      const rows = await db
        .select({
          submissionId: assignmentSubmissions.id,
          assignmentId: assignments.id,
          title: assignments.title,
          className: classes.name,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          type: assignments.type,
          deadline: assignments.deadline,
          submittedAt: assignmentSubmissions.submittedAt,
          score: assignmentSubmissions.score,
          feedback: assignmentSubmissions.feedback,
          gradedAt: assignmentSubmissions.gradedAt,
        })
        .from(assignmentSubmissions)
        .innerJoin(assignments, eq(assignmentSubmissions.assignmentId, assignments.id))
        .innerJoin(classes, eq(assignments.classId, classes.id))
        .innerJoin(subjects, eq(assignments.subjectId, subjects.id))
        .where(eq(assignmentSubmissions.studentId, studentId))
        .orderBy(desc(assignments.deadline));
      return rows.map((row) => ({
        submissionId: row.submissionId,
        assignmentId: row.assignmentId,
        title: row.title,
        className: row.className,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        type: row.type,
        deadline: new Date(row.deadline),
        submittedAt: new Date(row.submittedAt),
        score: row.score == null ? null : Number(row.score),
        feedback: row.feedback,
        gradedAt: row.gradedAt == null ? null : new Date(row.gradedAt),
      }));
    },
  };
}
