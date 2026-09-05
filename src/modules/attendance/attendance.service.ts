import type { AttendanceSession, CreateOption } from "./attendance.model.ts";
import type { AttendanceRepository, SessionRowJoined } from "./attendance.repo.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors.ts";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

function toDateIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface AttendanceServiceDeps {
  repo: AttendanceRepository;
}

export interface AttendanceService {
  createSession(options: {
    teacherId: string;
    classId: string;
    subjectId: string;
    validMinutes?: number;
    now?: Date;
  }): Promise<AttendanceSession>;
  optionsForTeacher(teacherId: string): Promise<CreateOption[]>;
  todaySessions(teacherId: string, now?: Date): Promise<AttendanceSession[]>;
  closeSession(sessionId: string, teacherId: string, now?: Date): Promise<AttendanceSession>;
  scan(code: string, studentId: string, now?: Date): Promise<ScanResult>;
}

export interface ScanResult {
  className: string;
  subjectCode: string;
  subjectName: string;
  code: string;
  status: "hadir";
  scannedAt: string;
}

export function createAttendanceService(
  deps: AttendanceServiceDeps,
): AttendanceService {
  const { repo } = deps;

  async function ensureUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      if (!(await repo.codeExists(code))) return code;
    }
    throw new Error("Gagal menghasilkan kode presensi unik");
  }

  async function sessionToDto(row: SessionRowJoined): Promise<AttendanceSession> {
    return {
      id: row.id,
      className: row.className,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      code: row.code,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  return {
    async createSession(options) {
      const now = options.now ?? new Date();
      const validMinutes = Math.min(
        240,
        Math.max(5, options.validMinutes ?? 60),
      );

      const teaches = await repo.teaches(
        options.classId,
        options.subjectId,
        options.teacherId,
      );
      if (!teaches) {
        throw new ForbiddenError(
          "Anda tidak mengampu kelas & mata pelajaran tersebut",
        );
      }

      const code = await ensureUniqueCode();
      const expiresAt = new Date(now.getTime() + validMinutes * 60 * 1000);

      const { id } = await repo.createSession({
        classId: options.classId,
        subjectId: options.subjectId,
        teacherId: options.teacherId,
        code,
        date: toDateIso(now),
        expiresAt,
      });

      const sessions = await repo.sessionsForTeacherOnDate(options.teacherId, toDateIso(now));
      const created = sessions.find((session) => session.id === id);
      if (!created) throw new NotFoundError("Sesi berhasil dibuat tetapi tidak ditemukan");
      return sessionToDto(created);
    },

    async optionsForTeacher(teacherId) {
      return repo.optionsForTeacher(teacherId);
    },

    async todaySessions(teacherId, now) {
      const rows = await repo.sessionsForTeacherOnDate(
        teacherId,
        toDateIso(now ?? new Date()),
      );
      return Promise.all(rows.map((row) => sessionToDto(row)));
    },

    async closeSession(sessionId, teacherId, now) {
      const closedAt = now ?? new Date();
      const closed = await repo.closeSession(sessionId, teacherId, closedAt);
      if (!closed) {
        throw new NotFoundError("Sesi presensi tidak ditemukan / bukan milik Anda");
      }

      const rows = await repo.sessionsForTeacherOnDate(teacherId, toDateIso(closedAt));
      const closedRow = rows.find((row) => row.id === sessionId);
      if (!closedRow) {
        throw new NotFoundError("Sesi presensi tidak ditemukan");
      }
      return sessionToDto(closedRow);
    },

    async scan(code, studentId, now) {
      const scannedAt = now ?? new Date();
      const normalized = code.trim().toUpperCase();

      const session = await repo.sessionByCode(normalized);
      if (!session) {
        throw new NotFoundError("Kode presensi tidak ditemukan");
      }
      if (session.expiresAt.getTime() <= scannedAt.getTime()) {
        throw new ValidationError("Kode presensi sudah kedaluwarsa");
      }

      const inClass = await repo.studentInClass(studentId, session.classId ?? "");
      if (!inClass) {
        throw new ForbiddenError("Anda tidak terdaftar di kelas sesi ini");
      }

      const already = await repo.attendanceExists(session.id, studentId);
      if (already) {
        throw new ConflictError("Anda sudah tercatat hadir pada sesi ini");
      }

      await repo.createAttendanceRecord(session.id, studentId, scannedAt);

      return {
        className: session.className,
        subjectCode: session.subjectCode,
        subjectName: session.subjectName,
        code: session.code,
        status: "hadir" as const,
        scannedAt: scannedAt.toISOString(),
      };
    },
  };
}
