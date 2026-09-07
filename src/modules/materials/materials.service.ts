import type { Role } from "../../common/types.ts";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.ts";
import { kindOf, validateFile } from "../../utils/storage.ts";
import type { PresignResult, MaterialItem } from "./materials.model.ts";
import type {
  ClassOption,
  MaterialsStore,
  MaterialRow,
} from "./materials.repo.ts";

export type PresignFn = (
  ext: string,
  contentType?: string,
) => Promise<{ key: string; uploadUrl: string; fileUrl: string }>;

export interface MaterialsServiceDeps {
  repo: MaterialsStore;
  presign: PresignFn;
}

export interface PrepareUploadOptions {
  teacherId: string;
  classId: string;
  subjectId: string;
  fileName: string;
  fileSize: number;
}

export interface ConfirmMaterialOptions {
  teacherId: string;
  classId: string;
  subjectId: string;
  key: string;
  title?: string;
  description?: string | null;
}

export interface MaterialListOptions {
  role: Role;
  userId: string;
  classId?: string;
  subjectId?: string;
  type?: "pdf" | "video" | "dokumen" | "catatan";
  q?: string;
}

export interface MaterialCommentItem {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  body: string;
  isHidden: boolean;
  createdAt: string;
}

export interface MaterialsService {
  prepareUpload(options: PrepareUploadOptions): Promise<PresignResult>;
  confirmMaterial(options: ConfirmMaterialOptions): Promise<MaterialItem>;
  createContent(options: CreateContentOptions): Promise<MaterialItem>;
  materialDetail(options: MaterialDetailOptions): Promise<MaterialItem>;
  listMaterials(options: MaterialListOptions): Promise<{
    availableClasses: ClassOption[];
    currentClassId: string | null;
    materials: MaterialItem[];
  }>;
  listMaterialComments(options: {
    role: Role;
    userId: string;
    id: string;
  }): Promise<{ canModerate: boolean; comments: MaterialCommentItem[] }>;
  addMaterialComment(options: {
    role: Role;
    userId: string;
    id: string;
    body: string;
  }): Promise<MaterialCommentItem>;
  setMaterialCommentHidden(options: {
    userId: string;
    id: string;
    commentId: string;
    hidden: boolean;
  }): Promise<MaterialCommentItem>;
  deleteMaterialComment(options: {
    userId: string;
    id: string;
    commentId: string;
  }): Promise<void>;
}

export interface CreateContentOptions {
  teacherId: string;
  classId: string;
  subjectId: string;
  title: string;
  description?: string | null;
  content: string;
}

export interface MaterialDetailOptions {
  role: Role;
  userId: string;
  id: string;
}

export const OBJECT_KEY_PATTERN = /^[0-9a-f]{32}\.(?:pdf|mp4|webm|mov|m4v|doc|docx|ppt|pptx|xls|xlsx|odt|txt)$/;

const CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain;charset=utf-8",
};

function baseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExt.length > 0 ? withoutExt.slice(0, 120) : "Materi";
}

function toItem(row: MaterialRow): MaterialItem {
  return {
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
    createdAt: row.createdAt.toISOString(),
  };
}

export function createMaterialsService(deps: MaterialsServiceDeps): MaterialsService {
  const { repo, presign } = deps;

  async function assertTeaches(classId: string, subjectId: string, teacherId: string) {
    const teaches = await repo.teaches(classId, subjectId, teacherId);
    if (!teaches) {
      throw new ForbiddenError(
        "Anda tidak mengampu kelas & mata pelajaran tersebut",
      );
    }
  }

  async function classesForRole(role: Role, userId: string): Promise<ClassOption[]> {
    switch (role) {
      case "murid": {
        const klass = await repo.studentClass(userId);
        return klass ? [klass] : [];
      }
      case "guru":
        return repo.teacherClasses(userId);
      case "orang_tua":
        return repo.parentClasses(userId);
      case "admin":
        return repo.allClasses();
    }
  }

  function toComment(row: {
    id: string;
    authorId: string;
    authorName: string;
    authorRole: Role;
    body: string;
    isHidden: boolean;
    createdAt: Date;
  }): MaterialCommentItem {
    return {
      id: row.id,
      authorId: row.authorId,
      authorName: row.authorName,
      authorRole: row.authorRole,
      body: row.body,
      isHidden: row.isHidden,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async function loadAccessibleMaterial(
    role: Role,
    userId: string,
    id: string,
  ) {
    const row = await repo.materialById(id);
    if (!row) throw new NotFoundError("Materi tidak ditemukan");
    const classes = await classesForRole(role, userId);
    if (!classes.some((c) => c.id === row.classId)) {
      throw new ForbiddenError("Anda tidak memiliki akses ke materi ini");
    }
    return row;
  }

  async function assertCanModerate(row: MaterialRow, userId: string) {
    const teaches = await repo.teaches(row.classId, row.subjectId!, userId);
    if (!teaches && row.teacherId !== userId) {
      throw new ForbiddenError("Hanya guru pengampu yang dapat memoderasi komentar");
    }
  }

  return {
    async prepareUpload(options) {
      const validation = validateFile(options.fileName, options.fileSize);
      if (!validation.ok || !validation.kind) {
        throw new ValidationError(
          validation.error ?? "Berkas tidak valid",
        );
      }

      await assertTeaches(options.classId, options.subjectId, options.teacherId);

      const ext = options.fileName.split(".").pop()?.toLowerCase() ?? "";
      const contentType = CONTENT_TYPE[ext] ?? "application/octet-stream";
      const signed = await presign(ext, contentType);

      return {
        key: signed.key,
        method: "PUT" as const,
        uploadUrl: signed.uploadUrl,
        fileUrl: signed.fileUrl,
        type: validation.kind,
      };
    },

    async confirmMaterial(options) {
      if (!OBJECT_KEY_PATTERN.test(options.key)) {
        throw new ValidationError("Kunci objek tidak valid");
      }
      const kind = kindOf(options.key);
      if (!kind) {
        throw new ValidationError("Ekstensi berkas tidak dikenali");
      }

      await assertTeaches(options.classId, options.subjectId, options.teacherId);

      const title = options.title?.trim() || baseName(options.key);
      const description = options.description?.trim() || null;

      const { id } = await repo.insertMaterial({
        classId: options.classId,
        subjectId: options.subjectId,
        teacherId: options.teacherId,
        title,
        description,
        fileUrl: `/uploads/${options.key}`,
        type: kind,
      });

      const row = await repo.materialById(id);
      if (!row) throw new ForbiddenError("Gagal memuat materi yang baru diunggah");
      return toItem(row);
    },

    async createContent(options) {
      const title = options.title.trim();
      const content = options.content.trim();
      if (!title || !content) {
        throw new ValidationError("Judul dan isi materi wajib diisi");
      }

      await assertTeaches(options.classId, options.subjectId, options.teacherId);

      const { id } = await repo.insertMaterial({
        classId: options.classId,
        subjectId: options.subjectId,
        teacherId: options.teacherId,
        title: title.slice(0, 160),
        description: options.description?.trim().slice(0, 500) || null,
        content,
        fileUrl: "",
        type: "catatan",
      });

      const row = await repo.materialById(id);
      if (!row) throw new ForbiddenError("Gagal memuat materi yang baru dibuat");
      return toItem(row);
    },

    async materialDetail(options) {
      const row = await repo.materialById(options.id);
      if (!row) throw new ForbiddenError("Materi tidak ditemukan");

      const classes = await classesForRole(options.role, options.userId);
      const allowed = classes.some((c) => c.id === row.classId);
      if (!allowed) {
        throw new ForbiddenError("Anda tidak memiliki akses ke materi ini");
      }
      return toItem(row);
    },

    async listMaterialComments({ role, userId, id }) {
      const row = await loadAccessibleMaterial(role, userId, id);
      const canModerate = role === "guru" &&
        (await (async () => {
          const teaches = await repo.teaches(row.classId, row.subjectId!, userId);
          return teaches || row.teacherId === userId;
        })());
      const rows = await repo.commentsByMaterial(id);
      const comments = (role === "guru" ? rows : rows.filter((r) => !r.isHidden))
        .map(toComment);
      return { canModerate, comments };
    },

    async addMaterialComment({ role, userId, id, body }) {
      const text = body.trim();
      if (text.length < 3 || text.length > 2000) {
        throw new ValidationError("Komentar harus 3–2000 karakter");
      }
      if (role !== "murid" && role !== "guru") {
        throw new ForbiddenError("Peran Anda tidak dapat berkomentar di materi");
      }
      await loadAccessibleMaterial(role, userId, id);
      const created = await repo.insertComment({
        materialId: id,
        authorId: userId,
        body: text,
      });
      return toComment(created);
    },

    async setMaterialCommentHidden({ userId, id, commentId, hidden }) {
      const row = await loadAccessibleMaterial("guru", userId, id);
      await assertCanModerate(row, userId);
      const comment = await repo.commentById(commentId);
      if (!comment || comment.materialId !== id) {
        throw new NotFoundError("Komentar tidak ditemukan");
      }
      const ok = await repo.setCommentHidden(commentId, hidden);
      if (!ok) throw new NotFoundError("Komentar tidak ditemukan");
      return toComment({ ...comment, isHidden: hidden });
    },

    async deleteMaterialComment({ userId, id, commentId }) {
      const row = await loadAccessibleMaterial("guru", userId, id);
      await assertCanModerate(row, userId);
      const comment = await repo.commentById(commentId);
      if (!comment || comment.materialId !== id) {
        throw new NotFoundError("Komentar tidak ditemukan");
      }
      const ok = await repo.deleteComment(commentId);
      if (!ok) throw new NotFoundError("Komentar tidak ditemukan");
    },

    async listMaterials(options) {
      const availableClasses = await classesForRole(options.role, options.userId);
      if (availableClasses.length === 0) {
        return { availableClasses: [], currentClassId: null, materials: [] };
      }

      const requested = availableClasses.some((c) => c.id === options.classId)
        ? options.classId
        : null;
      const classIds = requested
        ? [requested]
        : availableClasses.map((c) => c.id);

      const rows = await repo.listFiltered({
        classIds,
        subjectId: options.subjectId,
        type: options.type,
        q: options.q,
      });
      return {
        availableClasses,
        currentClassId: requested ?? null,
        materials: rows.map(toItem),
      };
    },
  };
}
