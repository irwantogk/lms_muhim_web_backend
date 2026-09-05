import type { Role } from "../../common/types.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.ts";
import type { MaterialsStore } from "../materials/materials.repo.ts";
import type {
  AssignmentItem,
  AssignmentQuestion,
  SubmissionItem,
} from "./assignments.model.ts";
import type {
  AssignmentQuestionRow,
  AssignmentRow,
  AssignmentsStore,
} from "./assignments.repo.ts";

export interface AssignmentsServiceDeps {
  repo: AssignmentsStore;
  scope: MaterialsStore;
}

export interface CreateAssignmentOptions {
  teacherId: string;
  classId: string;
  subjectId: string;
  title: string;
  instruction: string;
  type: "pilihan_ganda" | "esai" | "upload" | "campuran";
  deadline: string;
  questions?: AssignmentQuestion[];
}

export interface AssignmentListOptions {
  role: Role;
  userId: string;
  classId?: string;
}

export interface AssignmentsService {
  createAssignment(options: CreateAssignmentOptions): Promise<AssignmentItem>;
  listAssignments(options: AssignmentListOptions): Promise<{
    availableClasses: Array<{ id: string; name: string }>;
    currentClassId: string | null;
    assignments: AssignmentItem[];
  }>;
  submitAnswer(options: {
    studentId: string;
    assignmentId: string;
    answers?: Array<number | number[] | string>;
    text?: string;
    fileName?: string;
    now?: Date;
  }): Promise<SubmissionItem>;
  listSubmissions(options: {
    teacherId: string;
    assignmentId: string;
  }): Promise<SubmissionItem[]>;
  gradeSubmission(options: {
    teacherId: string;
    assignmentId: string;
    submissionId: string;
    score: number;
    feedback?: string;
    now?: Date;
  }): Promise<SubmissionItem>;
  myGrades(studentId: string): Promise<{
    summary: { total: number; graded: number; avg: number | null };
    results: Array<{
      submissionId: string;
      assignmentId: string;
      title: string;
      className: string;
      subjectCode: string;
      subjectName: string;
      type: "pilihan_ganda" | "esai" | "upload" | "campuran";
      deadline: string;
      submittedAt: string;
      score: number | null;
      feedback: string | null;
      gradedAt: string | null;
    }>;
  }>;
}

function validatePgAnswer(
  item: { multiple?: boolean; options: string[] },
  value: unknown,
  index: number,
): void {
  const optionCount = item.options.length;
  const label = `soal ${index + 1}`;
  if (item.multiple) {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((n) => typeof n !== "number" || n < 0 || n >= optionCount) ||
      new Set(value).size !== value.length
    ) {
      throw new ValidationError(`Pilihan ${label} tidak valid`);
    }
    return;
  }
  if (typeof value !== "number" || value < 0 || value >= optionCount) {
    throw new ValidationError(`Pilihan ${label} tidak valid`);
  }
}

function toItem(row: AssignmentRow): AssignmentItem {
  return {
    id: row.id,
    className: row.className,
    classId: row.classId,
    subjectCode: row.subjectCode,
    subjectName: row.subjectName,
    title: row.title,
    instruction: row.instruction,
    type: row.type,
    questions: row.questions,
    deadline: row.deadline.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toSubmission(row: {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  answer: unknown;
  score: number | null;
  feedback: string | null;
  submittedAt: Date;
}): SubmissionItem {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    studentName: row.studentName,
    answer: row.answer,
    submittedAt: row.submittedAt.toISOString(),
    score: row.score,
    feedback: row.feedback,
  };
}

export function createAssignmentsService(
  deps: AssignmentsServiceDeps,
): AssignmentsService {
  const { repo, scope } = deps;

  async function assertTeaches(classId: string, subjectId: string, teacherId: string) {
    const teaches = await scope.teaches(classId, subjectId, teacherId);
    if (!teaches) {
      throw new ForbiddenError(
        "Anda tidak mengampu kelas & mata pelajaran tersebut",
      );
    }
  }

  async function classesForRole(role: Role, userId: string): Promise<Array<{ id: string; name: string }>> {
    switch (role) {
      case "murid": {
        const klass = await scope.studentClass(userId);
        return klass ? [klass] : [];
      }
      case "guru":
        return scope.teacherClasses(userId);
      case "orang_tua":
        return scope.parentClasses(userId);
      case "admin":
        return scope.allClasses();
    }
  }

  return {
    async createAssignment(options) {
      if (!options.title.trim() || !options.instruction.trim()) {
        throw new ValidationError("Judul dan instruksi wajib diisi");
      }
      const deadlineDate = new Date(options.deadline);
      if (Number.isNaN(deadlineDate.getTime())) {
        throw new ValidationError("Tenggat tidak valid");
      }

      await assertTeaches(options.classId, options.subjectId, options.teacherId);

      let questions: AssignmentQuestionRow[] | null = null;
      const list = options.questions ?? [];
      if (options.type === "pilihan_ganda" || options.type === "campuran") {
        if (list.length === 0) {
          throw new ValidationError(
            options.type === "campuran"
              ? "Tugas campuran memerlukan minimal satu soal"
              : "Tugas pilihan ganda memerlukan minimal satu soal",
          );
        }
        const invalid = list.some((q) => {
          if (q.kind === "esai") return !q.text.trim();
          return !q.text.trim() || q.options.length < 2 || q.options.some((o) => !o.trim());
        });
        if (invalid) {
          throw new ValidationError(
            options.type === "campuran"
              ? "Lengkapi teks soal (PG & esai) dan pilihan jawaban"
              : "Lengkapi teks soal dan pilihan jawaban",
          );
        }
        if (options.type === "pilihan_ganda" && list.some((q) => q.kind === "esai")) {
          throw new ValidationError(
            "Tugas pilihan ganda hanya boleh berisi soal pilihan ganda. Gunakan jenis campuran untuk esai.",
          );
        }
        questions = list;
        const badKeys = list.some((q) => {
          if (q.kind === "esai") return false;
          if (q.multiple) {
            const keys = Array.isArray(q.correct) ? q.correct : [];
            return keys.length === 0 ||
              keys.some((k) => k < 0 || k >= q.options.length) ||
              new Set(keys).size !== keys.length;
          }
          const key = typeof q.correct === "number" ? q.correct : -1;
          return key < 0 || key >= q.options.length;
        });
        if (badKeys) {
          throw new ValidationError(
            "Kunci jawaban tidak valid. Untuk pilihan ganda boleh-multi tandai minimal satu kunci.",
          );
        }
      } else if (options.type === "esai" && list.length > 0) {
        if (list.some((q) => q.kind !== "esai" || !q.text.trim())) {
          throw new ValidationError(
            "Soal esai hanya boleh berisi pertanyaan esai yang lengkap",
          );
        }
        questions = list;
      }

      const { id } = await repo.insertAssignment({
        classId: options.classId,
        subjectId: options.subjectId,
        teacherId: options.teacherId,
        title: options.title.trim(),
        instruction: options.instruction.trim(),
        type: options.type,
        questions,
        deadline: deadlineDate,
      });

      const row = await repo.assignmentById(id);
      if (!row) throw new ForbiddenError("Gagal memuat tugas yang baru dibuat");
      return toItem(row);
    },

    async listAssignments(options) {
      const availableClasses = await classesForRole(options.role, options.userId);
      if (availableClasses.length === 0) {
        return { availableClasses: [], currentClassId: null, assignments: [] };
      }
      const requested = availableClasses.some((c) => c.id === options.classId)
        ? options.classId
        : null;
      const classIds = requested
        ? [requested]
        : availableClasses.map((c) => c.id);
      const rows = await repo.listByClassIds(classIds);
      return {
        availableClasses,
        currentClassId: requested ?? null,
        assignments: rows.map(toItem),
      };
    },

    async submitAnswer(options) {
      const now = options.now ?? new Date();
      const assignment = await repo.assignmentById(options.assignmentId);
      if (!assignment) throw new NotFoundError("Tugas tidak ditemukan");

      const klass = await scope.studentClass(options.studentId);
      if (!klass || klass.id !== assignment.classId) {
        throw new ForbiddenError("Tugas ini bukan untuk kelas Anda");
      }
      if (now.getTime() > assignment.deadline.getTime()) {
        throw new ValidationError(
          "Tenggat sudah lewat — jawaban tidak dapat dikumpulkan",
        );
      }
      if (await repo.submissionExists(options.assignmentId, options.studentId)) {
        throw new ConflictError("Kamu sudah mengumpulkan tugas ini");
      }

      let answer: unknown;
      if (assignment.type === "pilihan_ganda") {
        const items = assignment.questions ?? [];
        const selected = options.answers ?? [];
        if (selected.length !== items.length) {
          throw new ValidationError("Jawab seluruh soal pilihan ganda");
        }
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const value = selected[i];
          if (item.kind === "esai") {
            throw new ValidationError(`Pilihan soal ${i + 1} tidak valid`);
          }
          validatePgAnswer(item, value, i);
        }
        answer = { answers: selected };
      } else if (assignment.type === "esai") {
        const items = assignment.questions ?? [];
        if (items.length > 0) {
          let answers = options.answers ?? [];
          if (answers.length === 0 && typeof options.text === "string") {
            answers = [options.text.trim()];
          }
          if (answers.length !== items.length) {
            throw new ValidationError("Jawab seluruh soal esai");
          }
          for (let i = 0; i < items.length; i++) {
            const value = answers[i];
            if (typeof value !== "string" || value.trim().length === 0) {
              throw new ValidationError(`Jawaban esai nomor ${i + 1} kosong`);
            }
          }
          answer = { answers };
        } else {
          const text = options.text?.trim() ?? "";
          if (text.length === 0) {
            throw new ValidationError("Jawaban esai kosong");
          }
          answer = { text };
        }
      } else if (assignment.type === "campuran") {
        const items = assignment.questions ?? [];
        const selected = options.answers ?? [];
        if (selected.length !== items.length) {
          throw new ValidationError("Jawab seluruh soal (pilihan ganda & esai)");
        }
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const value = selected[i];
          if (item.kind === "esai") {
            if (typeof value !== "string" || value.trim().length === 0) {
              throw new ValidationError(`Jawaban esai nomor ${i + 1} kosong`);
            }
          } else {
            validatePgAnswer(item, value, i);
          }
        }
        answer = { answers: selected };
      } else {
        const fileName = options.fileName?.trim() ?? "";
        if (!fileName) {
          throw new ValidationError("Sertakan nama berkas jawaban");
        }
        answer = { fileName };
      }

      const { id } = await repo.insertSubmission({
        assignmentId: options.assignmentId,
        studentId: options.studentId,
        answer,
        submittedAt: now,
      });

      const rows = await repo.submissionsByAssignment(options.assignmentId);
      const row = rows.find((r) => r.id === id);
      if (!row) throw new NotFoundError("Gagal memuat jawaban yang dikumpulkan");
      return toSubmission(row);
    },

    async listSubmissions(options) {
      const assignment = await repo.assignmentById(options.assignmentId);
      if (!assignment) throw new NotFoundError("Tugas tidak ditemukan");
      const teaches = await scope.teaches(
        assignment.classId,
        assignment.subjectId,
        options.teacherId,
      );
      if (!teaches) {
        throw new ForbiddenError("Anda tidak mengampu tugas ini");
      }
      const rows = await repo.submissionsByAssignment(options.assignmentId);
      return rows.map(toSubmission);
    },

    async gradeSubmission(options) {
      const now = options.now ?? new Date();
      const assignment = await repo.assignmentById(options.assignmentId);
      if (!assignment) throw new NotFoundError("Tugas tidak ditemukan");

      const teaches = await scope.teaches(
        assignment.classId,
        assignment.subjectId,
        options.teacherId,
      );
      if (!teaches) {
        throw new ForbiddenError("Anda tidak mengampu tugas ini");
      }

      const existing = await repo.submissionsByAssignment(options.assignmentId);
      const target = existing.find((row) => row.id === options.submissionId);
      if (!target) throw new NotFoundError("Kiriman jawaban tidak ditemukan");

      const feedback = options.feedback?.trim() ?? null;
      const updated = await repo.updateGrade(options.submissionId, {
        score: options.score,
        feedback: feedback === "" ? null : feedback,
        gradedAt: now,
      });
      if (!updated) throw new NotFoundError("Kiriman jawaban tidak ditemukan");

      const after = await repo.submissionsByAssignment(options.assignmentId);
      const row = after.find((r) => r.id === options.submissionId);
      if (!row) throw new NotFoundError("Kiriman jawaban tidak ditemukan");
      return toSubmission(row);
    },

    async myGrades(studentId) {
      const rows = await repo.gradesForStudent(studentId);
      const scores = rows
        .map((row) => row.score)
        .filter((score): score is number => score != null);
      const graded = scores.length;
      const avg = graded === 0
        ? null
        : Math.round((scores.reduce((sum, s) => sum + s, 0) / graded) * 10) / 10;

      return {
        summary: { total: rows.length, graded, avg },
        results: rows.map((row) => ({
          submissionId: row.submissionId,
          assignmentId: row.assignmentId,
          title: row.title,
          className: row.className,
          subjectCode: row.subjectCode,
          subjectName: row.subjectName,
          type: row.type,
          deadline: row.deadline.toISOString(),
          submittedAt: row.submittedAt.toISOString(),
          score: row.score,
          feedback: row.feedback,
          gradedAt: row.gradedAt?.toISOString() ?? null,
        })),
      };
    },
  };
}
