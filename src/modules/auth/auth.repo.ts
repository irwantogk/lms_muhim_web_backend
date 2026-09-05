import { eq } from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import { authSessions, users } from "../../db/schema.ts";
import type { Role } from "../../common/types.ts";

export interface AuthUserRow {
  id: string;
  name: string;
  email: string | null;
  passwordHash: string;
  role: Role;
  isActive: boolean;
}

export interface AuthSessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  tokenFamilyId: string;
  version: number;
  isRevoked: boolean;
  expiresAt: Date;
  deviceInfo: string | null;
}

export interface NewSessionInput {
  userId: string;
  tokenHash: string;
  tokenFamilyId: string;
  version: number;
  expiresAt: Date;
  deviceInfo: string | null;
}

export interface AuthRepository {
  findByEmailHash(emailHash: string): Promise<AuthUserRow | null>;
  findByNisnHash(nisnHash: string): Promise<AuthUserRow | null>;
  findById(id: string): Promise<AuthUserRow | null>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRow | null>;
  createSession(input: NewSessionInput): Promise<AuthSessionRow>;
  revokeSessionById(id: string): Promise<void>;
  revokeFamily(tokenFamilyId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export function createAuthRepository(db: Database): AuthRepository {
  return {
    async findByEmailHash(emailHash) {
      const [user] = await db
        .select({
          id: users.id,
          name: users.fullName,
          email: users.email,
          passwordHash: users.passwordHash,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.emailHash, emailHash))
        .limit(1);
      return user ?? null;
    },

    async findByNisnHash(nisnHash) {
      const [user] = await db
        .select({
          id: users.id,
          name: users.fullName,
          email: users.email,
          passwordHash: users.passwordHash,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.nisnHash, nisnHash))
        .limit(1);
      return user ?? null;
    },

    async findById(id) {
      const [user] = await db
        .select({
          id: users.id,
          name: users.fullName,
          email: users.email,
          passwordHash: users.passwordHash,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return user ?? null;
    },

    async findSessionByTokenHash(tokenHash) {
      const [session] = await db
        .select()
        .from(authSessions)
        .where(eq(authSessions.tokenHash, tokenHash))
        .limit(1);
      if (!session) return null;
      return {
        id: session.id,
        userId: session.userId,
        tokenHash: session.tokenHash,
        tokenFamilyId: session.tokenFamilyId,
        version: session.version,
        isRevoked: session.isRevoked,
        expiresAt: session.expiresAt,
        deviceInfo: session.deviceInfo,
      };
    },

    async createSession(input) {
      const [session] = await db
        .insert(authSessions)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          tokenFamilyId: input.tokenFamilyId,
          version: input.version,
          isRevoked: false,
          expiresAt: input.expiresAt,
          deviceInfo: input.deviceInfo,
        })
        .returning();
      if (!session) {
        throw new Error("Gagal menyimpan sesi refresh token");
      }
      return {
        id: session.id,
        userId: session.userId,
        tokenHash: session.tokenHash,
        tokenFamilyId: session.tokenFamilyId,
        version: session.version,
        isRevoked: session.isRevoked,
        expiresAt: session.expiresAt,
        deviceInfo: session.deviceInfo,
      };
    },

    async revokeSessionById(id) {
      await db
        .update(authSessions)
        .set({ isRevoked: true })
        .where(eq(authSessions.id, id));
    },

    async revokeFamily(tokenFamilyId) {
      await db
        .update(authSessions)
        .set({ isRevoked: true })
        .where(eq(authSessions.tokenFamilyId, tokenFamilyId));
    },

    async revokeAllForUser(userId) {
      await db
        .update(authSessions)
        .set({ isRevoked: true })
        .where(eq(authSessions.userId, userId));
    },
  };
}
