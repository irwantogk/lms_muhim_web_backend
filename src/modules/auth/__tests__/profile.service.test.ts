import { describe, expect, it } from "bun:test";
import type { ProfileRow, ProfileStore } from "../profile.store.ts";
import { changePassword, getMe, updateMe } from "../profile.service.ts";
import { ValidationError } from "../../../utils/errors.ts";

class FakeProfileStore implements ProfileStore {
  rows = new Map<string, ProfileRow>();

  async byId(userId: string) {
    return this.rows.get(userId) ?? null;
  }

  async updateProfile(
    userId: string,
    input: { fullName?: string; photoUrl?: string | null },
  ) {
    const row = this.rows.get(userId);
    if (!row) return false;
    if (input.fullName !== undefined) row.fullName = input.fullName;
    if (input.photoUrl !== undefined) row.photoUrl = input.photoUrl;
    return true;
  }

  async setPassword(userId: string, passwordHash: string) {
    const row = this.rows.get(userId);
    if (!row) return false;
    row.passwordHash = passwordHash;
    return true;
  }
}

function deps(store: FakeProfileStore) {
  return {
    store,
    verify: async (password: string, hash: string) => password === hash,
    hash: async (password: string) => `h:${password}`,
    photo: {
      presign: async (ext: string) => ({
        key: `x.${ext}`,
        uploadUrl: "https://s3/upload",
        fileUrl: `/uploads/x.${ext}`,
      }),
    },
  };
}

function seeded(): FakeProfileStore {
  const store = new FakeProfileStore();
  const now = new Date("2026-09-07T08:00:00Z");
  store.rows.set("u1", {
    id: "u1",
    fullName: "Rani Aulia",
    email: "rani@school.id",
    nisn: null,
    role: "murid",
    isActive: true,
    photoUrl: null,
    passwordHash: "rahasia123",
    createdAt: now,
  });
  return store;
}

describe("profile service", () => {
  it("mengembalikan profil pengguna", async () => {
    const store = seeded();
    const me = await getMe(deps(store), "u1");
    expect(me.name).toBe("Rani Aulia");
    expect(me.role).toBe("murid");
  });

  it("memperbarui nama & foto", async () => {
    const store = seeded();
    const updated = await updateMe(deps(store), "u1", {
      fullName: "Rani Aulia Putri",
      photoUrl: "/uploads/abc.png",
    });
    expect(updated.name).toBe("Rani Aulia Putri");
    expect(updated.photoUrl).toBe("/uploads/abc.png");
  });

  it("menolak ubah sandi bila kata sandi lama salah", async () => {
    const store = seeded();
    await expect(
      changePassword(deps(store), "u1", {
        currentPassword: "salah",
        newPassword: "baru123",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("menolak kata sandi baru yang sama dengan lama", async () => {
    const store = seeded();
    await expect(
      changePassword(deps(store), "u1", {
        currentPassword: "rahasia123",
        newPassword: "rahasia123",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
