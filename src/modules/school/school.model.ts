import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";

export const classItemSchema = t.Object({
  id: t.String(),
  name: t.String(),
  grade: t.Integer(),
  academicYear: t.String(),
  studentCount: t.Integer(),
  subjectCount: t.Integer(),
});

export const subjectItemSchema = t.Object({
  id: t.String(),
  code: t.String(),
  name: t.String(),
  usedCount: t.Integer(),
});

export const createClassBodySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 120, description: "Nama kelas, contoh: XII IPA 1" }),
  grade: t.Integer({ minimum: 10, maximum: 12, description: "Tingkat (10/11/12)" }),
  academicYear: t.String({
    minLength: 4,
    maxLength: 20,
    description: "Tahun ajaran, contoh: 2025/2026",
  }),
});

export const updateClassBodySchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  grade: t.Optional(t.Integer({ minimum: 10, maximum: 12 })),
  academicYear: t.Optional(t.String({ minLength: 4, maxLength: 20 })),
});

export const createSubjectBodySchema = t.Object({
  code: t.String({
    minLength: 1,
    maxLength: 20,
    description: "Kode mapel, contoh: MTK",
  }),
  name: t.String({ minLength: 1, maxLength: 120, description: "Nama mapel" }),
});

export const updateSubjectBodySchema = t.Object({
  code: t.Optional(t.String({ minLength: 1, maxLength: 20 })),
  name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
});

export const idParamsSchema = t.Object({
  id: t.String({ pattern: uuidPattern }),
});

export const successClassListSchema = t.Object({
  success: t.Literal(true),
  data: t.Array(classItemSchema),
});

export const successSubjectListSchema = t.Object({
  success: t.Literal(true),
  data: t.Array(subjectItemSchema),
});

export const successClassItemSchema = t.Object({
  success: t.Literal(true),
  data: classItemSchema,
});

export const successSubjectItemSchema = t.Object({
  success: t.Literal(true),
  data: subjectItemSchema,
});

export const successDeleteSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({ id: t.String() }),
});

// ---------------------------------------------------------------------------
// Kelola pengguna
// ---------------------------------------------------------------------------
export const managedRoleSchema = t.Union([
  t.Literal("admin"),
  t.Literal("guru"),
  t.Literal("murid"),
  t.Literal("orang_tua"),
]);

export const assignableRoleSchema = t.Union([
  t.Literal("guru"),
  t.Literal("murid"),
  t.Literal("orang_tua"),
]);

export const managedUserItemSchema = t.Object({
  id: t.String(),
  fullName: t.String(),
  email: t.Union([t.String(), t.Null()]),
  nisn: t.Union([t.String(), t.Null()]),
  role: managedRoleSchema,
  isActive: t.Boolean(),
  photoUrl: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

export const listUsersQuerySchema = t.Object({
  role: t.Optional(managedRoleSchema),
  q: t.Optional(t.String({ maxLength: 100 })),
  status: t.Optional(
    t.Union([t.Literal("aktif"), t.Literal("nonaktif")]),
  ),
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  offset: t.Optional(t.Integer({ minimum: 0 })),
});

export const createUserBodySchema = t.Object({
  fullName: t.String({ minLength: 1, maxLength: 120 }),
  email: t.Optional(t.String({ maxLength: 255 })),
  nisn: t.Optional(t.String({ maxLength: 20 })),
  password: t.String({ minLength: 6, maxLength: 200 }),
  role: assignableRoleSchema,
});

export const updateUserBodySchema = t.Object({
  fullName: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  email: t.Optional(t.String({ maxLength: 255 })),
  nisn: t.Optional(t.String({ maxLength: 20 })),
  password: t.Optional(t.String({ minLength: 6, maxLength: 200 })),
  role: t.Optional(assignableRoleSchema),
  isActive: t.Optional(t.Boolean()),
});

export const successUserListSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    items: t.Array(managedUserItemSchema),
    total: t.Integer(),
    limit: t.Integer(),
    offset: t.Integer(),
  }),
});

export const successUserItemSchema = t.Object({
  success: t.Literal(true),
  data: managedUserItemSchema,
});

// ---------------------------------------------------------------------------
// Keanggotaan (murid di kelas & guru pengampu mapel)
// ---------------------------------------------------------------------------
export const classRefSchema = t.Object({ id: t.String(), name: t.String() });

export const memberRefSchema = t.Object({ id: t.String(), name: t.String() });

export const classIdQuerySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
});

export const studentMembershipDataSchema = t.Object({
  class: classRefSchema,
  enrolled: t.Array(memberRefSchema),
  candidates: t.Array(memberRefSchema),
});

export const teacherAssignmentItemSchema = t.Object({
  id: t.String(),
  subjectId: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  teacherId: t.String(),
  teacherName: t.String(),
});

export const teacherMembershipDataSchema = t.Object({
  class: classRefSchema,
  assignments: t.Array(teacherAssignmentItemSchema),
  availableSubjects: t.Array(memberRefSchema),
  teachers: t.Array(memberRefSchema),
});

export const addStudentBodySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
  studentId: t.String({ pattern: uuidPattern }),
});

export const moveStudentBodySchema = t.Object({
  studentId: t.String({ pattern: uuidPattern }),
  classId: t.String({ pattern: uuidPattern }),
});

export const removeStudentQuerySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
  studentId: t.String({ pattern: uuidPattern }),
});

export const addTeacherBodySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
  subjectId: t.String({ pattern: uuidPattern }),
  teacherId: t.String({ pattern: uuidPattern }),
});

export const changeTeacherBodySchema = t.Object({
  teacherId: t.String({ pattern: uuidPattern }),
});

export const successStudentMembershipSchema = t.Object({
  success: t.Literal(true),
  data: studentMembershipDataSchema,
});

export const successTeacherMembershipSchema = t.Object({
  success: t.Literal(true),
  data: teacherMembershipDataSchema,
});

export const successOkSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({ ok: t.Literal(true) }),
});

export type ManagedUserItem = Static<typeof managedUserItemSchema>;
export type ClassItem = Static<typeof classItemSchema>;
export type SubjectItem = Static<typeof subjectItemSchema>;
