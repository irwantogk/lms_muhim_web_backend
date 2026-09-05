import { Elysia, t } from "elysia";
import { db } from "../../db/index.ts";
import { JWT_SECRET } from "../../common/env.ts";
import { authBasePlugin, requireAccessToken, roleGuard } from "../auth/auth.plugin.ts";
import { createMaterialsStore } from "../materials/materials.repo.ts";
import { createAssignmentsStore } from "./assignments.repo.ts";
import { createAssignmentsService } from "./assignments.service.ts";
import {
  assignmentIdParamsSchema,
  createAssignmentBodySchema,
  gradeSubmissionBodySchema,
  gradeSubmissionParamsSchema,
  listAssignmentsQuerySchema,
  submitAnswerBodySchema,
  successCreateAssignmentSchema,
  successGradeSubmissionSchema,
  successListAssignmentsSchema,
  successListSubmissionsSchema,
  successMyGradesSchema,
  successSubmitAnswerSchema,
} from "./assignments.model.ts";

const errorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Array(t.Unknown()),
  }),
});

const assignmentsService = createAssignmentsService({
  repo: createAssignmentsStore(db),
  scope: createMaterialsStore(db),
});

export const assignmentsModule = new Elysia({ prefix: "/assignments" })
  .use(authBasePlugin(JWT_SECRET))
  .post(
    "/",
    async ({ body, authUser }) => {
      const data = await assignmentsService.createAssignment({
        teacherId: authUser!.id,
        classId: body.classId,
        subjectId: body.subjectId,
        title: body.title,
        instruction: body.instruction,
        type: body.type,
        deadline: body.deadline,
        questions: body.questions,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      body: createAssignmentBodySchema,
      response: { 200: successCreateAssignmentSchema, 400: errorSchema, 403: errorSchema },
      detail: {
        summary: "Simpan tugas baru (RBAC: guru)",
        description:
          "Membuat tugas untuk kelas/mapel yang diampu (verifikasi pengampu). Mendukung jenis " +
          "pilihan_ganda (dengan daftar soal), esai, dan upload, beserta tenggat.",
        tags: ["Assignments"],
        responses: {
          "200": { description: "Tugas tersimpan" },
          "400": { description: "Data tidak valid (deadline/soal/body)" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu kelas/mapel / peran salah" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/",
    async ({ query, authUser }) => {
      const data = await assignmentsService.listAssignments({
        role: authUser!.role,
        userId: authUser!.id,
        classId: query.classId,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: requireAccessToken(),
      query: listAssignmentsQuerySchema,
      response: { 200: successListAssignmentsSchema },
      detail: {
        summary: "Ambil daftar tugas sesuai peran",
        description:
          "Mengembalikan tugas sesuai peran: guru (kelas diampu), murid (kelasnya), orang tua " +
          "(kelas anak), admin (semua). Filter opsional `classId`.",
        tags: ["Assignments"],
        responses: {
          "200": { description: "Daftar tugas dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/:id/submissions",
    async ({ params, body, authUser }) => {
      const data = await assignmentsService.submitAnswer({
        studentId: authUser!.id,
        assignmentId: params.id,
        answers: body.answers,
        text: body.text,
        fileName: body.fileName,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["murid"]),
      params: assignmentIdParamsSchema,
      body: submitAnswerBodySchema,
      response: {
        200: successSubmitAnswerSchema,
        400: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
      detail: {
        summary: "Kumpulkan jawaban murid (RBAC: murid, sesuai tenggat)",
        description:
          "Menerima jawaban murid untuk tugas kelasnya. Menolak bila tenggat telah lewat, " +
          "tugas bukan untuk kelasnya, duplikat, atau isi tidak sesuai jenis tugas.",
        tags: ["Assignments"],
        responses: {
          "200": { description: "Jawaban tersimpan" },
          "400": { description: "Tenggat lewat / isi tidak valid" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan tugas kelas murid / peran salah" },
          "404": { description: "Tugas tidak ditemukan" },
          "409": { description: "Sudah mengumpulkan tugas ini" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/:id/submissions",
    async ({ params, authUser }) => {
      const data = await assignmentsService.listSubmissions({
        teacherId: authUser!.id,
        assignmentId: params.id,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      params: assignmentIdParamsSchema,
      response: { 200: successListSubmissionsSchema, 403: errorSchema, 404: errorSchema },
      detail: {
        summary: "Ambil daftar jawaban murid per tugas (RBAC: guru)",
        description:
          "Menampilkan seluruh kiriman jawaban murid untuk sebuah tugas, hanya untuk guru " +
          "pengampu tugas tsb.",
        tags: ["Assignments"],
        responses: {
          "200": { description: "Daftar jawaban dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu tugas / peran salah" },
          "404": { description: "Tugas tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/:id/submissions/:submissionId/grade",
    async ({ params, body, authUser }) => {
      const data = await assignmentsService.gradeSubmission({
        teacherId: authUser!.id,
        assignmentId: params.id,
        submissionId: params.submissionId,
        score: body.score,
        feedback: body.feedback,
      });
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["guru"]),
      params: gradeSubmissionParamsSchema,
      body: gradeSubmissionBodySchema,
      response: {
        200: successGradeSubmissionSchema,
        400: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Simpan nilai & komentar jawaban murid (RBAC: guru)",
        description:
          "Memberi nilai (0–100) dan komentar untuk kiriman jawaban murid pada sebuah tugas. " +
          "Hanya guru pengampu tugas tersebut yang dapat menilai.",
        tags: ["Assignments"],
        responses: {
          "200": { description: "Nilai & komentar tersimpan" },
          "400": { description: "Nilai/komentar tidak valid" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Bukan pengampu tugas / peran salah" },
          "404": { description: "Tugas atau kiriman tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/me/nilai",
    async ({ authUser }) => {
      const data = await assignmentsService.myGrades(authUser!.id);
      return { success: true as const, data };
    },
    {
      beforeHandle: roleGuard(["murid"]),
      response: { 200: successMyGradesSchema },
      detail: {
        summary: "Ambil nilai & komentar murid (RBAC: murid)",
        description:
          "Mengembalikan seluruh hasil tugas murid (kiriman yang sudah dinilai maupun belum) " +
          "beserta ringkasan: jumlah tugas, sudah dinilai, dan rata-rata nilai.",
        tags: ["Assignments"],
        responses: {
          "200": { description: "Nilai murid dimuat" },
          "401": { description: "Token tidak valid / tidak disertakan" },
          "403": { description: "Peran tidak diizinkan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );
