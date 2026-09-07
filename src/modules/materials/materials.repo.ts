import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import {
  classes,
  classStudents,
  classSubjectTeacher,
  materialComments,
  materials,
  parentStudents,
  subjects,
  users,
} from "../../db/schema.ts";

export interface ClassOption {
  id: string;
  name: string;
}

export type MaterialKind = "pdf" | "video" | "dokumen" | "catatan";

export interface MaterialRow {
  id: string;
  className: string;
  classId: string;
  subjectId?: string;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  teacherId?: string;
  title: string;
  description: string | null;
  content: string | null;
  fileUrl: string;
  type: MaterialKind;
  createdAt: Date;
}

export interface MaterialCommentRow {
  id: string;
  materialId: string;
  authorId: string;
  authorName: string;
  authorRole: "admin" | "guru" | "murid" | "orang_tua";
  body: string;
  isHidden: boolean;
  createdAt: Date;
}

export interface InsertMaterialInput {
  classId: string;
  subjectId: string;
  teacherId: string;
  title: string;
  description: string | null;
  content?: string | null;
  fileUrl: string;
  type: MaterialKind;
}

export interface MaterialsStore {
  teaches(classId: string, subjectId: string, teacherId: string): Promise<boolean>;
  studentClass(studentId: string): Promise<ClassOption | null>;
  teacherClasses(teacherId: string): Promise<ClassOption[]>;
  parentClasses(parentId: string): Promise<ClassOption[]>;
  allClasses(): Promise<ClassOption[]>;
  materialById(id: string): Promise<MaterialRow | null>;
  commentsByMaterial(materialId: string): Promise<MaterialCommentRow[]>;
  insertComment(input: {
    materialId: string;
    authorId: string;
    body: string;
  }): Promise<MaterialCommentRow>;
  commentById(id: string): Promise<MaterialCommentRow | null>;
  setCommentHidden(id: string, hidden: boolean): Promise<boolean>;
  deleteComment(id: string): Promise<boolean>;
  listFiltered(query: {
    classIds: string[];
    subjectId?: string;
    type?: MaterialKind;
    q?: string;
  }): Promise<MaterialRow[]>;
  insertMaterial(input: InsertMaterialInput): Promise<{ id: string }>;
}

export function createMaterialsStore(db: Database): MaterialsStore {
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

    async studentClass(studentId) {
      const [row] = await db
        .select({ id: classes.id, name: classes.name })
        .from(classStudents)
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(classStudents.studentId, studentId))
        .limit(1);
      return row ?? null;
    },

    async teacherClasses(teacherId) {
      const rows = await db
        .select({ id: classes.id, name: classes.name })
        .from(classSubjectTeacher)
        .innerJoin(classes, eq(classSubjectTeacher.classId, classes.id))
        .where(eq(classSubjectTeacher.teacherId, teacherId))
        .groupBy(classes.id, classes.name)
        .orderBy(classes.name);
      return rows;
    },

    async parentClasses(parentId) {
      const rows = await db
        .select({ id: classes.id, name: classes.name })
        .from(parentStudents)
        .innerJoin(classStudents, eq(parentStudents.studentId, classStudents.studentId))
        .innerJoin(classes, eq(classStudents.classId, classes.id))
        .where(eq(parentStudents.parentId, parentId))
        .groupBy(classes.id, classes.name)
        .orderBy(classes.name);
      return rows;
    },

    async allClasses() {
      const rows = await db
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .orderBy(classes.name);
      return rows;
    },

    async materialById(id) {
      const [row] = await db
        .select({
          id: materials.id,
          className: classes.name,
          classId: materials.classId,
          subjectId: materials.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          teacherName: users.fullName,
          title: materials.title,
          description: materials.description,
          content: materials.content,
          fileUrl: materials.fileUrl,
          type: materials.type,
          createdAt: materials.createdAt,
        })
        .from(materials)
        .innerJoin(classes, eq(materials.classId, classes.id))
        .innerJoin(subjects, eq(materials.subjectId, subjects.id))
        .innerJoin(users, eq(materials.teacherId, users.id))
        .where(eq(materials.id, id))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        className: row.className,
        classId: row.classId,
        subjectId: row.subjectId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        teacherName: row.teacherName,
        title: row.title,
        description: row.description,
        content: row.content,
        fileUrl: row.fileUrl,
        type: row.type,
        createdAt: new Date(row.createdAt),
      };
    },

    async commentsByMaterial(materialId) {
      return db
        .select({
          id: materialComments.id,
          materialId: materialComments.materialId,
          authorId: materialComments.authorId,
          authorName: users.fullName,
          authorRole: users.role,
          body: materialComments.body,
          isHidden: materialComments.isHidden,
          createdAt: materialComments.createdAt,
        })
        .from(materialComments)
        .innerJoin(users, eq(materialComments.authorId, users.id))
        .where(eq(materialComments.materialId, materialId))
        .orderBy(desc(materialComments.createdAt));
    },

    async insertComment(input) {
      const [row] = await db
        .insert(materialComments)
        .values(input)
        .returning({ id: materialComments.id });
      if (!row) throw new Error("Gagal menyimpan komentar");
      return (await this.commentById(row.id))!;
    },

    async commentById(id) {
      const [row] = await db
        .select({
          id: materialComments.id,
          materialId: materialComments.materialId,
          authorId: materialComments.authorId,
          authorName: users.fullName,
          authorRole: users.role,
          body: materialComments.body,
          isHidden: materialComments.isHidden,
          createdAt: materialComments.createdAt,
        })
        .from(materialComments)
        .innerJoin(users, eq(materialComments.authorId, users.id))
        .where(eq(materialComments.id, id))
        .limit(1);
      return row ?? null;
    },

    async setCommentHidden(id, hidden) {
      const result = await db
        .update(materialComments)
        .set({ isHidden: hidden })
        .where(eq(materialComments.id, id))
        .returning({ id: materialComments.id });
      return result.length > 0;
    },

    async deleteComment(id) {
      const result = await db
        .delete(materialComments)
        .where(eq(materialComments.id, id))
        .returning({ id: materialComments.id });
      return result.length > 0;
    },

    async listFiltered(filter) {
      if (filter.classIds.length === 0) return [];

      const conds: SQL[] = [inArray(materials.classId, filter.classIds)];
      if (filter.subjectId) {
        conds.push(eq(materials.subjectId, filter.subjectId));
      }
      if (filter.type) {
        conds.push(eq(materials.type, filter.type));
      }
      const keyword = filter.q?.trim();
      if (keyword) {
        const like = `%${keyword.toLowerCase()}%`;
        conds.push(
          or(
            ilike(materials.title, like),
            ilike(materials.description, like),
            ilike(subjects.name, like),
            ilike(classes.name, like),
          )!,
        );
      }

      const rows = await db
        .select({
          id: materials.id,
          className: classes.name,
          classId: materials.classId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          teacherName: users.fullName,
          title: materials.title,
          description: materials.description,
          content: materials.content,
          fileUrl: materials.fileUrl,
          type: materials.type,
          createdAt: materials.createdAt,
        })
        .from(materials)
        .innerJoin(classes, eq(materials.classId, classes.id))
        .innerJoin(subjects, eq(materials.subjectId, subjects.id))
        .innerJoin(users, eq(materials.teacherId, users.id))
        .where(and(...conds))
        .orderBy(desc(materials.createdAt));
      return rows.map((row) => ({
        id: row.id,
        className: row.className,
        classId: row.classId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        teacherName: row.teacherName,
        title: row.title,
        description: row.description,
        content: row.content,
        fileUrl: row.fileUrl,
        type: row.type,
        createdAt: new Date(row.createdAt),
      }));
    },

    async insertMaterial(input) {
      const [row] = await db
        .insert(materials)
        .values({
          classId: input.classId,
          subjectId: input.subjectId,
          teacherId: input.teacherId,
          title: input.title,
          description: input.description,
          content: input.content ?? null,
          fileUrl: input.fileUrl,
          type: input.type,
        })
        .returning({ id: materials.id });
      if (!row) throw new Error("Gagal menyimpan materi");
      return row;
    },
  };
}
