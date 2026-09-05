import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";

export const assignmentTypeSchema = t.Union([
  t.Literal("pilihan_ganda"),
  t.Literal("esai"),
  t.Literal("upload"),
  t.Literal("campuran"),
]);

export const assignmentQuestionSchema = t.Union([
  t.Object({
    kind: t.Optional(t.Literal("pilihan_ganda")),
    text: t.String({ minLength: 1 }),
    options: t.Array(t.String({ minLength: 1 }), { minItems: 2 }),
    multiple: t.Optional(t.Boolean()),
    correct: t.Union([
      t.Integer({ minimum: 0 }),
      t.Array(t.Integer({ minimum: 0 })),
    ]),
  }),
  t.Object({
    kind: t.Literal("esai"),
    text: t.String({ minLength: 1 }),
  }),
]);

export const assignmentItemSchema = t.Object({
  id: t.String(),
  className: t.String(),
  classId: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  title: t.String(),
  instruction: t.String(),
  type: assignmentTypeSchema,
  questions: t.Union([t.Array(assignmentQuestionSchema), t.Null()]),
  deadline: t.String(),
  createdAt: t.String(),
});

export const createAssignmentBodySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
  subjectId: t.String({ pattern: uuidPattern }),
  title: t.String({ minLength: 1, maxLength: 200 }),
  instruction: t.String({ minLength: 1, maxLength: 2000 }),
  type: assignmentTypeSchema,
  deadline: t.String({ minLength: 10, description: "Tenggat ISO (date-time)" }),
  questions: t.Optional(t.Array(assignmentQuestionSchema)),
});

export const listAssignmentsQuerySchema = t.Object({
  classId: t.Optional(
    t.String({ pattern: uuidPattern, description: "ID kelas (opsional)" }),
  ),
});

export const successCreateAssignmentSchema = t.Object({
  success: t.Literal(true),
  data: assignmentItemSchema,
});

export const successListAssignmentsSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    availableClasses: t.Array(
      t.Object({ id: t.String(), name: t.String() }),
    ),
    currentClassId: t.Union([t.String(), t.Null()]),
    assignments: t.Array(assignmentItemSchema),
  }),
});

export const submitAnswerBodySchema = t.Object({
  answers: t.Optional(
    t.Array(
      t.Union([
        t.Integer({ minimum: 0 }),
        t.Array(t.Integer({ minimum: 0 })),
        t.String({ maxLength: 5000 }),
      ]),
      { description: "Jawaban per soal (angka/angka jamak untuk PG, teks untuk esai)" },
    ),
  ),
  text: t.Optional(t.String({ maxLength: 5000, description: "Jawaban esai" })),
  fileName: t.Optional(
    t.String({ maxLength: 255, description: "Nama berkas jawaban" }),
  ),
});

export const submissionItemSchema = t.Object({
  id: t.String(),
  assignmentId: t.String(),
  studentId: t.String(),
  studentName: t.String(),
  answer: t.Unknown(),
  submittedAt: t.String(),
  score: t.Union([t.Number(), t.Null()]),
  feedback: t.Union([t.String(), t.Null()]),
});

export const successSubmitAnswerSchema = t.Object({
  success: t.Literal(true),
  data: submissionItemSchema,
});

export const successListSubmissionsSchema = t.Object({
  success: t.Literal(true),
  data: t.Array(submissionItemSchema),
});

export const gradeSubmissionBodySchema = t.Object({
  score: t.Integer({ minimum: 0, maximum: 100 }),
  feedback: t.Optional(t.String({ maxLength: 2000 })),
});

export const gradeSubmissionParamsSchema = t.Object({
  id: t.String({ pattern: uuidPattern }),
  submissionId: t.String({ pattern: uuidPattern }),
});

export const successGradeSubmissionSchema = t.Object({
  success: t.Literal(true),
  data: submissionItemSchema,
});

export const gradeResultItemSchema = t.Object({
  submissionId: t.String(),
  assignmentId: t.String(),
  title: t.String(),
  className: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  type: assignmentTypeSchema,
  deadline: t.String(),
  submittedAt: t.String(),
  score: t.Union([t.Number(), t.Null()]),
  feedback: t.Union([t.String(), t.Null()]),
  gradedAt: t.Union([t.String(), t.Null()]),
});

export const myGradesDataSchema = t.Object({
  summary: t.Object({
    total: t.Integer(),
    graded: t.Integer(),
    avg: t.Union([t.Number(), t.Null()]),
  }),
  results: t.Array(gradeResultItemSchema),
});

export const successMyGradesSchema = t.Object({
  success: t.Literal(true),
  data: myGradesDataSchema,
});

export const assignmentIdParamsSchema = t.Object({
  id: t.String({ pattern: uuidPattern }),
});

export type SubmissionItem = Static<typeof submissionItemSchema>;
export type AssignmentItem = Static<typeof assignmentItemSchema>;
export type AssignmentQuestion = Static<typeof assignmentQuestionSchema>;
