import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";
import type { Role } from "../../common/types.ts";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors.ts";

const ROLES = new Set<Role>(["admin", "guru", "murid", "orang_tua"]);

export interface AuthUser {
  id: string;
  role: Role;
}

export interface AuthGuardContext {
  authUser: AuthUser | null;
}

/**
 * Basis otentikasi: menyediakan decorator `authUser` ({ id, role })
 * hasil verifikasi header `Authorization: Bearer <token>` (JWT).
 */
export function authBasePlugin(secret: string) {
  return new Elysia({ name: "lms-auth" })
    .use(jwt({ name: "jwt", secret }))
    .derive({ as: "scoped" }, async ({ jwt, headers }) => {
      const header = headers["authorization"];
      if (!header?.startsWith("Bearer ")) return { authUser: null };

      const token = header.slice("Bearer ".length).trim();
      if (!token) return { authUser: null };

      const payload = await jwt.verify(token);
      if (payload === false) return { authUser: null };

      const claims = payload as Record<string, unknown>;
      if (
        typeof claims["sub"] === "string" &&
        typeof claims["role"] === "string" &&
        ROLES.has(claims["role"] as Role)
      ) {
        return {
          authUser: {
            id: claims["sub"],
            role: claims["role"] as Role,
          },
        };
      }
      return { authUser: null };
    });
}

/**
 * Factory guard RBAC untuk hook `beforeHandle` rute:
 * - Tanpa token / token tidak valid -> lempar 401 UNAUTHORIZED
 * - Peran tidak sesuai -> lempar 403 FORBIDDEN
 * (keduanya dipetakan oleh global onError).
 */
export function roleGuard(roles: Role[]) {
  return function authorize({ authUser }: AuthGuardContext) {
    if (!authUser) {
      throw new UnauthorizedError(
        "Autentikasi diperlukan: sertakan header Authorization: Bearer <access_token>",
      );
    }
    if (!roles.includes(authUser.role)) {
      throw new ForbiddenError(
        `Endpoint ini hanya untuk peran ${roles.join(" / ")}`,
      );
    }
  };
}

/** Guard generik: hanya memerlukan access token valid (tanpa cek peran). */
export function requireAccessToken() {
  return function authorize({ authUser }: AuthGuardContext) {
    if (!authUser) {
      throw new UnauthorizedError(
        "Autentikasi diperlukan: sertakan header Authorization: Bearer <access_token>",
      );
    }
  };
}
