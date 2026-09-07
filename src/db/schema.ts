import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "guru", "murid", "orang_tua"]);
export const attendanceStatusEnum = pgEnum("attendance_status", [
  "hadir",
  "terlambat",
  "izin",
  "sakit",
]);
export const materialTypeEnum = pgEnum("material_type", [
  "pdf",
  "video",
  "dokumen",
  "catatan",
]);
export const assignmentTypeEnum = pgEnum("assignment_type", [
  "pilihan_ganda",
  "esai",
  "upload",
  "campuran",
]);

const uuidPk = uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuidPk,
    fullName: text("full_name").notNull(),
    // Data sensitif disimpan TERENKRIPSI (AES-256-GCM); lookup/unique memakai kolom hash.
    email: text("email"),
    emailHash: text("email_hash"),
    nisn: text("nisn"),
    nisnHash: text("nisn_hash"),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    photoUrl: text("photo_url"),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("users_email_hash_unique").on(table.emailHash),
    unique("users_nisn_hash_unique").on(table.nisnHash),
  ],
);

// ---------------------------------------------------------------------------
// auth_sessions  (pelacakan refresh token untuk rotasi & revokasi)
// ---------------------------------------------------------------------------
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuidPk,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenFamilyId: uuid("token_family_id").notNull(),
    version: integer("version").notNull().default(0),
    isRevoked: boolean("is_revoked").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deviceInfo: text("device_info"),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_family_id_idx").on(table.tokenFamilyId),
  ],
);

// ---------------------------------------------------------------------------
// classes & subjects
// ---------------------------------------------------------------------------
export const classes = pgTable("classes", {
  id: uuidPk,
  name: text("name").notNull(),
  grade: integer("grade").notNull(),
  academicYear: text("academic_year").notNull(),
  createdAt,
  updatedAt,
});

export const subjects = pgTable(
  "subjects",
  {
    id: uuidPk,
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [unique("subjects_code_unique").on(table.code)],
);

// ---------------------------------------------------------------------------
// class_subject_teacher  (guru pengampu mapel di sebuah kelas)
// ---------------------------------------------------------------------------
export const classSubjectTeacher = pgTable(
  "class_subject_teacher",
  {
    id: uuidPk,
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("cst_class_subject_unique").on(table.classId, table.subjectId),
  ],
);

// ---------------------------------------------------------------------------
// class_students  (keanggotaan murid di kelas)
// ---------------------------------------------------------------------------
export const classStudents = pgTable(
  "class_students",
  {
    id: uuidPk,
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade", onUpdate: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    entryYear: text("entry_year").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("class_students_class_student_unique").on(table.classId, table.studentId),
  ],
);

// ---------------------------------------------------------------------------
// parent_students  (relasi orang tua ke murid)
// ---------------------------------------------------------------------------
export const parentStudents = pgTable(
  "parent_students",
  {
    id: uuidPk,
    parentId: uuid("parent_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    relation: text("relation").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("parent_students_parent_student_unique").on(table.parentId, table.studentId),
  ],
);

// ---------------------------------------------------------------------------
// schedules  (jadwal mingguan per kelas)
// ---------------------------------------------------------------------------
export const schedules = pgTable(
  "schedules",
  {
    id: uuidPk,
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0=Min .. 6=Sab
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("schedules_slot_unique").on(
      table.classId,
      table.subjectId,
      table.dayOfWeek,
      table.startTime,
    ),
    index("schedules_class_day_idx").on(table.classId, table.dayOfWeek),
  ],
);

// ---------------------------------------------------------------------------
// attendance_sessions  (sesi presensi yang dibuat guru)
// ---------------------------------------------------------------------------
export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: uuidPk,
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    date: date("date").notNull(),
    code: text("code").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("attendance_sessions_code_unique").on(table.code),
    index("attendance_sessions_date_idx").on(table.date),
    index("attendance_sessions_teacher_date_idx").on(table.teacherId, table.date),
  ],
);

// ---------------------------------------------------------------------------
// attendance_records  (catatan hadir per murid pada sesi)
// ---------------------------------------------------------------------------
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuidPk,
    sessionId: uuid("session_id")
      .notNull()
      .references(() => attendanceSessions.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    status: attendanceStatusEnum("status").notNull(),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("attendance_records_session_student_unique").on(
      table.sessionId,
      table.studentId,
    ),
    index("attendance_records_student_id_idx").on(table.studentId),
  ],
);

// ---------------------------------------------------------------------------
// assignments  (tugas yang dibuat guru)
// ---------------------------------------------------------------------------
export const assignments = pgTable(
  "assignments",
  {
    id: uuidPk,
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    title: text("title").notNull(),
    instruction: text("instruction"),
    type: assignmentTypeEnum("type").notNull(),
    questions: jsonb("questions"),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("assignments_class_idx").on(table.classId),
    index("assignments_subject_idx").on(table.subjectId),
    index("assignments_teacher_idx").on(table.teacherId),
    index("assignments_deadline_idx").on(table.deadline),
  ],
);

// ---------------------------------------------------------------------------
// assignment_submissions  (jawaban/kumpulan murid)
// ---------------------------------------------------------------------------
export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: uuidPk,
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    answer: jsonb("answer"),
    score: numeric("score"),
    feedback: text("feedback"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("assignment_submissions_assignment_student_unique").on(
      table.assignmentId,
      table.studentId,
    ),
    index("assignment_submissions_student_idx").on(table.studentId),
    index("assignment_submissions_graded_idx").on(table.gradedAt),
    index("assignment_submissions_submitted_idx").on(table.submittedAt),
    index("assignment_submissions_pending_idx")
      .on(table.assignmentId)
      .where(sql`${table.gradedAt} is null`),
  ],
);

// ---------------------------------------------------------------------------
// materials  (materi pelajaran yang diunggah guru)
// ---------------------------------------------------------------------------
export const materials = pgTable(
  "materials",
  {
    id: uuidPk,
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    content: text("content"),
    fileUrl: text("file_url").notNull().default(""),
    type: materialTypeEnum("type").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("materials_class_idx").on(table.classId),
    index("materials_subject_idx").on(table.subjectId),
    index("materials_teacher_idx").on(table.teacherId),
  ],
);

// ---------------------------------------------------------------------------
// material_comments  (komentar murid/guru pada materi; dimoderasi guru)
// ---------------------------------------------------------------------------
export const materialComments = pgTable(
  "material_comments",
  {
    id: uuidPk,
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade", onUpdate: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    body: text("body").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("material_comments_material_idx").on(table.materialId),
    index("material_comments_author_idx").on(table.authorId),
  ],
);

// ---------------------------------------------------------------------------
// forum_topics  (diskusi per kelas/mata pelajaran)
// ---------------------------------------------------------------------------
export const forumTopics = pgTable(
  "forum_topics",
  {
    id: uuidPk,
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade", onUpdate: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade", onUpdate: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("forum_topics_class_idx").on(table.classId),
    index("forum_topics_subject_idx").on(table.subjectId),
    index("forum_topics_author_idx").on(table.authorId),
  ],
);

// ---------------------------------------------------------------------------
// forum_replies  (balasan topik)
// ---------------------------------------------------------------------------
export const forumReplies = pgTable(
  "forum_replies",
  {
    id: uuidPk,
    topicId: uuid("topic_id")
      .notNull()
      .references(() => forumTopics.id, { onDelete: "cascade", onUpdate: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    body: text("body").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("forum_replies_topic_idx").on(table.topicId),
    index("forum_replies_author_idx").on(table.authorId),
  ],
);

// ---------------------------------------------------------------------------
// relations (ringkas untuk kebutuhan join implisit & migrasi)
// ---------------------------------------------------------------------------
export const classRelations = relations(classes, ({ many }) => ({
  classStudents: many(classStudents),
  schedules: many(schedules),
  classSubjectTeachers: many(classSubjectTeacher),
  attendanceSessions: many(attendanceSessions),
  assignments: many(assignments),
  materials: many(materials),
  forumTopics: many(forumTopics),
}));

export const userRelations = relations(users, ({ many }) => ({
  classStudents: many(classStudents),
  classSubjectTeachers: many(classSubjectTeacher),
  parentLinks: many(parentStudents),
  authSessions: many(authSessions),
  attendanceSessions: many(attendanceSessions),
  attendanceRecords: many(attendanceRecords),
  assignments: many(assignments),
  submissions: many(assignmentSubmissions),
  materialsUploaded: many(materials),
  forumTopics: many(forumTopics),
  forumReplies: many(forumReplies),
}));
