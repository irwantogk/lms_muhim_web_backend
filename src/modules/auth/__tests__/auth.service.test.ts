import { describe, expect, it } from "bun:test";
import { ForbiddenError, TokenReuseError, UnauthorizedError } from "../../../utils/errors.ts";
import type { AuthRepository, AuthSessionRow } from "../auth.repo.ts";
import { identityHash, normalizeEmail, normalizeNisn } from "../../../utils/crypto.ts";
import { createAuthService } from "../auth.service.ts";

const MURID = {
  id: "00000000-0000-4000-8000-000000000021",
  name: "Rani Aulia",
  email: "rani.aulia@cendekia.sch.id",
  passwordHash: "hash-1",
  role: "murid" as const,
  isActive: true,
};

const MURID_NISN = "1029384756";

class FakeAuthRepository implements AuthRepository {
  users = new Map([[MURID.email, MURID]]);
  nisnToEmail = new Map([[MURID_NISN, MURID.email]]);
  sessions = new Map<string, AuthSessionRow>();
  nextId = 1;

  async findByEmailHash(hash: string) {
    for (const email of this.users.keys()) {
      if (identityHash(normalizeEmail(email)) === hash) {
        return this.users.get(email) ?? null;
      }
    }
    return null;
  }

  async findByNisnHash(hash: string) {
    for (const [nisn, email] of this.nisnToEmail) {
      if (identityHash(normalizeNisn(nisn)) === hash) {
        return this.users.get(email) ?? null;
      }
    }
    return null;
  }

  async findById(id: string) {
    const user = [...this.users.values()].find((u) => u.id === id);
    return user ?? null;
  }

  async findSessionByTokenHash(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    tokenFamilyId: string;
    version: number;
    expiresAt: Date;
    deviceInfo: string | null;
  }) {
    const session: AuthSessionRow = {
      id: `session-${this.nextId++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      tokenFamilyId: input.tokenFamilyId,
      version: input.version,
      isRevoked: false,
      expiresAt: input.expiresAt,
      deviceInfo: input.deviceInfo,
    };
    this.sessions.set(session.tokenHash, session);
    return session;
  }

  async revokeSessionById(id: string) {
    for (const session of this.sessions.values()) {
      if (session.id === id) session.isRevoked = true;
    }
  }

  async revokeFamily(tokenFamilyId: string) {
    for (const session of this.sessions.values()) {
      if (session.tokenFamilyId === tokenFamilyId) session.isRevoked = true;
    }
  }

  async revokeAllForUser(userId: string) {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) session.isRevoked = true;
    }
  }
}

function buildService(repo: AuthRepository) {
  return createAuthService({
    repo,
    verify: async (password, hash) =>
      password === "rahasia123" && hash === "hash-1",
    refreshTokenTtlDays: 30,
  });
}

describe("authService (dual-token & rotasi)", () => {
  it("login menerbitkan refresh token & menyimpan sesi", async () => {
    const repo = new FakeAuthRepository();
    const result = await buildService(repo).login(MURID_NISN, "rahasia123", "test-agent");

    expect(result.user.role).toBe("murid");
    expect(result.session.refreshToken.length).toBeGreaterThan(32);
    expect(repo.sessions.size).toBe(1);
    const stored = repo.sessions.values().next().value as AuthSessionRow;
    expect(stored.isRevoked).toBe(false);
    expect(stored.version).toBe(0);
    expect(stored.tokenHash).not.toBe(result.session.refreshToken);
  });

  it("menolak kata sandi salah", async () => {
    const repo = new FakeAuthRepository();
    expect(
      buildService(repo).login(MURID_NISN, "salah123", null),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("menolak email yang tidak dikenal", async () => {
    const repo = new FakeAuthRepository();
    expect(
      buildService(repo).login("nobody@mail.com", "rahasia123", null),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("menolak login akun yang dinonaktifkan", async () => {
    const repo = new FakeAuthRepository();
    const inactive = {
      ...MURID,
      id: "00000000-0000-4000-8000-000000000099",
      email: "off.murid@mail.com",
      isActive: false,
    };
    repo.users.set(inactive.email, inactive);
    repo.nisnToEmail.set("9988776655", inactive.email);
    await expect(
      buildService(repo).login("9988776655", "rahasia123", null),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("murid tidak dapat login lewat email", async () => {
    const repo = new FakeAuthRepository();
    await expect(
      buildService(repo).login(MURID.email, "rahasia123", null),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rotasi mencabut token lama & menerbitkan token baru se-keluarga", async () => {
    const repo = new FakeAuthRepository();
    const service = buildService(repo);

    const login = await service.login(MURID_NISN, "rahasia123", null);
    const family = (repo.sessions.values().next().value as AuthSessionRow)
      .tokenFamilyId;

    const rotated = await service.rotate(login.session.refreshToken, null);

    expect(rotated.session.refreshToken).not.toBe(login.session.refreshToken);
    expect(repo.sessions.size).toBe(2);
    const oldSession = [...repo.sessions.values()].find(
      (s) => s.tokenHash.length && s.id === login.session.sessionId,
    );
    expect(oldSession?.isRevoked).toBe(true);
    const newSessions = [...repo.sessions.values()].filter(
      (s) => s.id === rotated.session.sessionId,
    );
    expect(newSessions[0]?.version).toBe(1);
    expect(newSessions[0]?.tokenFamilyId).toBe(family);
  });

  it("token lama yang dipakai ulang mencabut seluruh keluarga (reuse attack)", async () => {
    const repo = new FakeAuthRepository();
    const service = buildService(repo);

    const login = await service.login(MURID_NISN, "rahasia123", null);
    const rotated = await service.rotate(login.session.refreshToken, null);

    await expect(
      service.rotate(login.session.refreshToken, null),
    ).rejects.toBeInstanceOf(TokenReuseError);

    const allRevoked = [...repo.sessions.values()].every((s) => s.isRevoked);
    expect(allRevoked).toBe(true);
    expect([...repo.sessions.values()].some((s) => s.id === rotated.session.sessionId)).toBe(true);
  });

  it("refresh token kedaluwarsa ditolak", async () => {
    const repo = new FakeAuthRepository();
    const service = buildService(repo);

    const login = await service.login(MURID_NISN, "rahasia123", null);
    const session = [...repo.sessions.values()].find(
      (s) => s.id === login.session.sessionId,
    );
    if (session) session.expiresAt = new Date(Date.now() - 1000);

    await expect(
      service.rotate(login.session.refreshToken, null),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("logout perangkat hanya mencabut sesi tersebut", async () => {
    const repo = new FakeAuthRepository();
    const service = buildService(repo);

    const first = await service.login(MURID_NISN, "rahasia123", null);
    const second = await service.login(MURID_NISN, "rahasia123", null);

    await service.revoke(first.session.refreshToken);

    const firstRow = [...repo.sessions.values()].find(
      (s) => s.id === first.session.sessionId,
    );
    const secondRow = [...repo.sessions.values()].find(
      (s) => s.id === second.session.sessionId,
    );
    expect(firstRow?.isRevoked).toBe(true);
    expect(secondRow?.isRevoked).toBe(false);
  });

  it("logout-all mencabut seluruh sesi pengguna", async () => {
    const repo = new FakeAuthRepository();
    const service = buildService(repo);

    await service.login(MURID_NISN, "rahasia123", null);
    await service.login(MURID_NISN, "rahasia123", null);

    await service.revokeAll(MURID.id);

    expect([...repo.sessions.values()].every((s) => s.isRevoked)).toBe(true);
  });
});
