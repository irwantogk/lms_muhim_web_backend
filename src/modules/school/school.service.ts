import type {
  ManagedUserRow,
  SchoolStore,
  UserListFilter,
} from "./school.repo.ts";
import type {
  ClassItem,
  ManagedUserItem,
  SubjectItem,
} from "./school.model.ts";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.ts";
import {
  aesDecrypt,
  aesEncrypt,
  identityHash,
  maskEmail,
  maskNisn,
  normalizeEmail,
  normalizeNisn,
} from "../../utils/crypto.ts";
import type { Role } from "../../common/types.ts";

export interface SchoolServiceDeps {
  repo: SchoolStore;
}

function maskedOf(
  encrypted: string | null,
  mask: (value: string) => string,
): string | null {
  if (!encrypted) return null;
  try {
    return mask(aesDecrypt(encrypted));
  } catch {
    return null;
  }
}

function toManagedUser(row: ManagedUserRow): ManagedUserItem {
  return {
    id: row.id,
    fullName: row.fullName,
    email: maskedOf(row.email, maskEmail),
    nisn: maskedOf(row.nisn, maskNisn),
    role: row.role,
    isActive: row.isActive,
    photoUrl: row.photoUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Siapkan email: ciphertext + hash lookup. Kosong -> null. */
function prepareEmail(email?: string): {
  email: string | null;
  emailHash: string | null;
} {
  const normalized = email?.trim() ?? "";
  if (!normalized) return { email: null, emailHash: null };
  if (!normalized.includes("@")) {
    throw new ValidationError("Email tidak valid");
  }
  return {
    email: aesEncrypt(normalizeEmail(normalized)),
    emailHash: identityHash(normalizeEmail(normalized)),
  };
}

/** Siapkan NISN (10 digit): ciphertext + hash lookup. */
function prepareNisn(nisn?: string): {
  nisn: string;
  nisnHash: string;
} {
  const normalized = normalizeNisn(nisn ?? "");
  if (!/^\d{10}$/.test(normalized)) {
    throw new ValidationError("NISN harus berupa 10 digit angka");
  }
  return {
    nisn: aesEncrypt(normalized),
    nisnHash: identityHash(normalized),
  };
}

export interface SchoolService {
  listClasses(): Promise<ClassItem[]>;
  createClass(input: {
    name: string;
    grade: number;
    academicYear: string;
  }): Promise<ClassItem>;
  updateClass(
    id: string,
    input: { name?: string; grade?: number; academicYear?: string },
  ): Promise<ClassItem>;
  deleteClass(id: string): Promise<void>;
  listSubjects(): Promise<SubjectItem[]>;
  createSubject(input: { code: string; name: string }): Promise<SubjectItem>;
  updateSubject(
    id: string,
    input: { code?: string; name?: string },
  ): Promise<SubjectItem>;
  deleteSubject(id: string): Promise<void>;
  listUsers(
    filter?: UserListFilter,
    opts?: { limit?: number; offset?: number },
  ): Promise<{ items: ManagedUserItem[]; total: number }>;
  getUser(id: string): Promise<ManagedUserItem>;
  createUser(input: {
    fullName: string;
    email?: string;
    nisn?: string;
    password: string;
    role: Role;
  }): Promise<ManagedUserItem>;
  updateUser(
    id: string,
    input: {
      fullName?: string;
      email?: string;
      nisn?: string;
      password?: string;
      role?: Role;
      isActive?: boolean;
    },
  ): Promise<ManagedUserItem>;
  getStudentMembership(classId: string): Promise<{
    class: { id: string; name: string };
    enrolled: Array<{ id: string; name: string }>;
    candidates: Array<{ id: string; name: string }>;
  }>;
  addStudentMembership(classId: string, studentId: string): Promise<void>;
  removeStudentMembership(classId: string, studentId: string): Promise<void>;
  moveStudentMembership(studentId: string, classId: string): Promise<void>;
  getTeacherMembership(classId: string): Promise<{
    class: { id: string; name: string };
    assignments: Array<{
      id: string;
      subjectId: string;
      subjectCode: string;
      subjectName: string;
      teacherId: string;
      teacherName: string;
    }>;
    availableSubjects: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; name: string }>;
  }>;
  addTeacherAssignment(
    classId: string,
    subjectId: string,
    teacherId: string,
  ): Promise<void>;
  changeTeacher(rowId: string, teacherId: string): Promise<void>;
  removeTeacherAssignment(rowId: string): Promise<void>;
}

export function createSchoolService(
  deps: SchoolServiceDeps,
): SchoolService {
  const { repo } = deps;

  async function findClass(id: string): Promise<ClassItem> {
    const row = (await repo.listClasses(id))[0];
    if (!row) throw new NotFoundError("Kelas tidak ditemukan");
    return row;
  }

  async function findSubject(id: string): Promise<SubjectItem> {
    const row = (await repo.listSubjects(id))[0];
    if (!row) throw new NotFoundError("Mata pelajaran tidak ditemukan");
    return row;
  }

  async function findManagedUser(id: string): Promise<ManagedUserRow> {
    const row = (await repo.listUsers()).find((user) => user.id === id);
    if (!row) throw new NotFoundError("Pengguna tidak ditemukan");
    return row;
  }

  return {
    async listClasses() {
      return repo.listClasses();
    },

    async createClass(input) {
      const name = input.name.trim();
      if (await repo.classNameExists(name)) {
        throw new ConflictError(`Sudah ada kelas dengan nama “${name}”`);
      }
      const { id } = await repo.insertClass({
        name,
        grade: input.grade,
        academicYear: input.academicYear.trim(),
      });
      return findClass(id);
    },

    async updateClass(id, input) {
      const current = await findClass(id);
      const name = input.name?.trim() ?? current.name;
      const grade = input.grade ?? current.grade;
      const academicYear = input.academicYear?.trim() ?? current.academicYear;
      if (name !== current.name && await repo.classNameExists(name, id)) {
        throw new ConflictError(`Sudah ada kelas dengan nama “${name}”`);
      }
      await repo.updateClass(id, { name, grade, academicYear });
      return findClass(id);
    },

    async deleteClass(id) {
      await findClass(id);
      const usage = await repo.classInUse(id);
      if (usage) {
        throw new ConflictError(
          `Kelas tidak dapat dihapus karena masih dipakai oleh ${usage.section}`,
        );
      }
      await repo.deleteClass(id);
    },

    async listSubjects() {
      return repo.listSubjects();
    },

    async createSubject(input) {
      const code = input.code.trim().toUpperCase();
      if (await repo.subjectCodeExists(code)) {
        throw new ConflictError(`Sudah ada mapel dengan kode “${code}”`);
      }
      const { id } = await repo.insertSubject({
        code,
        name: input.name.trim(),
      });
      return findSubject(id);
    },

    async updateSubject(id, input) {
      const current = await findSubject(id);
      const code = input.code?.trim().toUpperCase() ?? current.code;
      const name = input.name?.trim() ?? current.name;
      if (code !== current.code && await repo.subjectCodeExists(code, id)) {
        throw new ConflictError(`Sudah ada mapel dengan kode “${code}”`);
      }
      await repo.updateSubject(id, { code, name });
      return findSubject(id);
    },

    async deleteSubject(id) {
      await findSubject(id);
      const usage = await repo.subjectInUse(id);
      if (usage) {
        throw new ConflictError(
          `Mapel tidak dapat dihapus karena masih dipakai oleh ${usage.section}`,
        );
      }
      await repo.deleteSubject(id);
    },

    async listUsers(filter, opts) {
      const rows = await repo.listUsers(filter, opts);
      const total = await repo.countUsers(filter);
      return { items: rows.map(toManagedUser), total };
    },

    async getUser(id) {
      return toManagedUser(await findManagedUser(id));
    },

    async createUser(input) {
      const passwordHash = await Bun.password.hash(input.password);
      const role = input.role;
      const email = prepareEmail(input.email);
      if (role !== "murid" && !email.email) {
        throw new ValidationError("Email wajib diisi untuk peran ini");
      }
      if (email.emailHash && await repo.emailHashExists(email.emailHash)) {
        throw new ConflictError("Email sudah terdaftar");
      }
      let nisn: { nisn: string; nisnHash: string } | null = null;
      if (role === "murid") {
        nisn = prepareNisn(input.nisn);
        if (await repo.nisnHashExists(nisn.nisnHash)) {
          throw new ConflictError("NISN sudah terdaftar");
        }
      }
      const { id } = await repo.insertUser({
        fullName: input.fullName.trim(),
        email: email.email,
        emailHash: email.emailHash,
        nisn: nisn?.nisn ?? null,
        nisnHash: nisn?.nisnHash ?? null,
        passwordHash,
        role,
      });
      return toManagedUser(await findManagedUser(id));
    },

    async updateUser(id, input) {
      const current = await findManagedUser(id);
      const role = input.role ?? current.role;

      let email = current.email;
      let emailHash = current.emailHash;
      const nextEmail = input.email?.trim() ?? "";
      if (nextEmail) {
        const prepared = prepareEmail(nextEmail);
        if (prepared.emailHash && await repo.emailHashExists(prepared.emailHash, id)) {
          throw new ConflictError("Email sudah terdaftar");
        }
        email = prepared.email;
        emailHash = prepared.emailHash;
      }
      if (role !== "murid" && !email) {
        throw new ValidationError("Email wajib diisi untuk peran ini");
      }

      let nisn = current.nisn;
      let nisnHash = current.nisnHash;
      const nextNisn = normalizeNisn(input.nisn ?? "");
      if (nextNisn) {
        const prepared = prepareNisn(nextNisn);
        if (await repo.nisnHashExists(prepared.nisnHash, id)) {
          throw new ConflictError("NISN sudah terdaftar");
        }
        nisn = prepared.nisn;
        nisnHash = prepared.nisnHash;
      }
      if (role === "murid" && !nisn) {
        throw new ValidationError("NISN wajib diisi untuk murid");
      }

      let passwordHash = current.passwordHash;
      if (input.password) {
        passwordHash = await Bun.password.hash(input.password);
      }
      await repo.updateUser(id, {
        fullName: input.fullName?.trim() ?? current.fullName,
        email,
        emailHash,
        nisn: role === "murid" ? nisn : null,
        nisnHash: role === "murid" ? nisnHash : null,
        role,
        isActive: input.isActive ?? current.isActive,
        passwordHash,
      });
      return toManagedUser(await findManagedUser(id));
    },

    async getStudentMembership(classId) {
      const klass = (await repo.listClasses(classId))[0];
      if (!klass) throw new NotFoundError("Kelas tidak ditemukan");
      const enrolled = await repo.listClassStudents(classId);
      const candidates = await repo.listStudentCandidates();
      return {
        class: { id: klass.id, name: klass.name },
        enrolled,
        candidates,
      };
    },

    async addStudentMembership(classId, studentId) {
      const klass = (await repo.listClasses(classId))[0];
      if (!klass) throw new NotFoundError("Kelas tidak ditemukan");
      const membership = await repo.studentMembership(studentId);
      if (membership) {
        throw new ConflictError("Murid sudah terdaftar di sebuah kelas");
      }
      const year = new Date().getFullYear();
      await repo.addClassStudent(classId, studentId, `${year}/${year + 1}`);
    },

    async removeStudentMembership(classId, studentId) {
      const removed = await repo.removeClassStudent(classId, studentId);
      if (!removed) {
        throw new NotFoundError("Murid tidak terdaftar di kelas tersebut");
      }
    },

    async moveStudentMembership(studentId, classId) {
      const target = (await repo.listClasses(classId))[0];
      if (!target) throw new NotFoundError("Kelas tujuan tidak ditemukan");
      const currentClassId = await repo.studentMembership(studentId);
      if (!currentClassId) {
        throw new NotFoundError(
          "Murid belum terdaftar di kelas mana pun — gunakan Tambahkan",
        );
      }
      if (currentClassId === classId) {
        throw new ConflictError("Murid sudah berada di kelas tersebut");
      }
      const updated = await repo.updateStudentClass(studentId, classId);
      if (!updated) throw new NotFoundError("Murid tidak ditemukan");
    },

    async getTeacherMembership(classId) {
      const klass = (await repo.listClasses(classId))[0];
      if (!klass) throw new NotFoundError("Kelas tidak ditemukan");
      const assignments = await repo.listSubjectTeachers(classId);
      const availableSubjects = await repo.listAvailableSubjects(classId);
      const teachers = await repo.listTeacherCandidates();
      return {
        class: { id: klass.id, name: klass.name },
        assignments,
        availableSubjects,
        teachers,
      };
    },

    async addTeacherAssignment(classId, subjectId, teacherId) {
      const klass = (await repo.listClasses(classId))[0];
      if (!klass) throw new NotFoundError("Kelas tidak ditemukan");
      const teachers = await repo.listTeacherCandidates();
      if (!teachers.some((teacher) => teacher.id === teacherId)) {
        throw new NotFoundError("Guru tidak ditemukan");
      }
      if (await repo.teacherAssignmentExists(classId, subjectId)) {
        throw new ConflictError("Mapel tersebut sudah memiliki guru pengampu di kelas ini");
      }
      const available = await repo.listAvailableSubjects(classId);
      if (!available.some((subject) => subject.id === subjectId)) {
        throw new ConflictError("Mata pelajaran tidak dikenal untuk kelas ini");
      }
      await repo.assignTeacher(classId, subjectId, teacherId);
    },

    async changeTeacher(rowId, teacherId) {
      const teachers = await repo.listTeacherCandidates();
      if (!teachers.some((teacher) => teacher.id === teacherId)) {
        throw new NotFoundError("Guru tidak ditemukan");
      }
      const changed = await repo.changeTeacher(rowId, teacherId);
      if (!changed) throw new NotFoundError("Penugasan guru tidak ditemukan");
    },

    async removeTeacherAssignment(rowId) {
      const removed = await repo.removeTeacherAssignment(rowId);
      if (!removed) {
        throw new NotFoundError("Penugasan guru tidak ditemukan");
      }
    },
  };
}
