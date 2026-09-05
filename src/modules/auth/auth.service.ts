import type { Role } from "../../common/types.ts";
import {
  ForbiddenError,
  TokenReuseError,
  UnauthorizedError,
} from "../../utils/errors.ts";
import { identityHash, normalizeEmail, normalizeNisn } from "../../utils/crypto.ts";
import { randomToken, sha256Hex } from "../../utils/token.ts";
import type { AuthRepository, AuthUserRow } from "./auth.repo.ts";

export type PasswordVerifier = (password: string, hash: string) => Promise<boolean>;

export interface SessionUserInfo {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface TokenPairResult {
  user: SessionUserInfo;
  session: IssuedSession;
}

export interface AuthService {
  login(identifier: string, password: string, deviceInfo: string | null): Promise<TokenPairResult>;
  rotate(refreshToken: string, deviceInfo: string | null): Promise<TokenPairResult>;
  revoke(refreshToken: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
}

export interface AuthServiceDeps {
  repo: AuthRepository;
  verify: PasswordVerifier;
  /** Masa berlaku refresh token dalam hari. */
  refreshTokenTtlDays: number;
}

function toUserInfo(row: { id: string; name: string; email: string | null; role: Role }) {
  return {
    id: row.id,
    name: row.name,
    // Email tidak disebarkan lewat payload sesi (privasi); hanya profil pemilik yang menampilkannya.
    email: "",
    role: row.role,
  };
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { repo, verify, refreshTokenTtlDays } = deps;

  async function issueSession(
    userId: string,
    familyId: string,
    version: number,
    deviceInfo: string | null,
  ): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const tokenHash = await sha256Hex(refreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );

    const session = await repo.createSession({
      userId,
      tokenHash,
      tokenFamilyId: familyId,
      version,
      expiresAt: refreshExpiresAt,
      deviceInfo,
    });

    return {
      sessionId: session.id,
      refreshToken,
      refreshExpiresAt,
    };
  }

  async function loadUser(userId: string): Promise<SessionUserInfo> {
    const user = await repo.findById(userId);
    if (!user) {
      throw new UnauthorizedError("Akun tidak ditemukan");
    }
    return toUserInfo(user);
  }

  return {
    async login(identifier, password, deviceInfo) {
      const value = identifier.trim();
      const isNisn = /^\d{10}$/.test(value);

      let user: AuthUserRow | null = null;
      if (isNisn) {
        // Murid login wajib NISN.
        const row = await repo.findByNisnHash(identityHash(normalizeNisn(value)));
        user = row && row.role === "murid" ? row : null;
      } else {
        // Guru / orang tua / admin login memakai email; murid tidak lewat email.
        const row = await repo.findByEmailHash(identityHash(normalizeEmail(value)));
        user = row && row.role !== "murid" ? row : null;
      }

      if (!user) {
        throw new UnauthorizedError("NISN/email atau kata sandi salah");
      }

      const isValid = await verify(password, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedError("NISN/email atau kata sandi salah");
      }
      if (!user.isActive) {
        throw new ForbiddenError("Akun Anda telah dinonaktifkan oleh admin");
      }

      const familyId = crypto.randomUUID();
      const session = await issueSession(user.id, familyId, 0, deviceInfo);

      return { user: toUserInfo(user), session };
    },

    async rotate(refreshToken, deviceInfo) {
      const tokenHash = await sha256Hex(refreshToken);
      const existing = await repo.findSessionByTokenHash(tokenHash);
      if (!existing) {
        throw new UnauthorizedError("Refresh token tidak valid");
      }

      // Reuse attack: token lama sudah pernah dipakai/dicabut.
      if (existing.isRevoked) {
        await repo.revokeFamily(existing.tokenFamilyId);
        throw new TokenReuseError(
          "Refresh token terdeteksi dipakai ulang — seluruh sesi perangkat telah dicabut",
        );
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        await repo.revokeSessionById(existing.id);
        throw new UnauthorizedError("Refresh token telah kedaluwarsa");
      }

      const user = await loadUser(existing.userId);

      // Rotasi: cabut token lama, terbitkan pasangan baru dalam keluarga yang sama.
      await repo.revokeSessionById(existing.id);
      const session = await issueSession(
        existing.userId,
        existing.tokenFamilyId,
        existing.version + 1,
        deviceInfo,
      );

      return { user, session };
    },

    async revoke(refreshToken) {
      const tokenHash = await sha256Hex(refreshToken);
      const existing = await repo.findSessionByTokenHash(tokenHash);
      if (existing) {
        await repo.revokeSessionById(existing.id);
      }
    },

    async revokeAll(userId) {
      await repo.revokeAllForUser(userId);
    },
  };
}
