import { eq } from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import type { Role } from "../../common/types.ts";
import { users } from "../../db/schema.ts";

export interface ProfileRow {
  id: string;
  fullName: string;
  email: string | null;
  nisn: string | null;
  role: Role;
  isActive: boolean;
  photoUrl: string | null;
  passwordHash: string;
  createdAt: Date;
}

export interface ProfileStore {
  byId(userId: string): Promise<ProfileRow | null>;
  updateProfile(
    userId: string,
    input: { fullName?: string; photoUrl?: string | null },
  ): Promise<boolean>;
  setPassword(userId: string, passwordHash: string): Promise<boolean>;
}

export function createProfileStore(db: Database): ProfileStore {
  return {
    async byId(userId) {
      const [row] = await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          nisn: users.nisn,
          role: users.role,
          isActive: users.isActive,
          photoUrl: users.photoUrl,
          passwordHash: users.passwordHash,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row ?? null;
    },

    async updateProfile(userId, input) {
      const set: {
        fullName?: string;
        photoUrl?: string | null;
      } = {};
      if (input.fullName !== undefined) set.fullName = input.fullName;
      if (input.photoUrl !== undefined) set.photoUrl = input.photoUrl;
      const result = await db
        .update(users)
        .set(set)
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      return result.length > 0;
    },

    async setPassword(userId, passwordHash) {
      const result = await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      return result.length > 0;
    },
  };
}
