import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";

export const roleSchema = t.Union([
  t.Literal("admin"),
  t.Literal("guru"),
  t.Literal("murid"),
  t.Literal("orang_tua"),
]);

export const loginBodySchema = t.Object({
  identifier: t.String({
    minLength: 1,
    maxLength: 255,
    description:
      "Email (guru/orang tua/admin) atau NISN 10 digit (murid). Murid wajib memakai NISN.",
  }),
  password: t.String({ minLength: 6, description: "Kata sandi" }),
});

export const refreshBodySchema = t.Object({
  refreshToken: t.String({
    minLength: 32,
    description: "Refresh token yang ingin dirotasi",
  }),
});

export const logoutBodySchema = t.Object({
  refreshToken: t.String({
    minLength: 32,
    description: "Refresh token perangkat yang akan di-logout",
  }),
});

export const authUserSchema = t.Object({
  id: t.String({ pattern: uuidPattern }),
  name: t.String(),
  email: t.String(),
  role: roleSchema,
});

export const tokenPairSchema = t.Object({
  accessToken: t.String({ description: "JWT access token (masa berlaku 15 menit)" }),
  refreshToken: t.String({ description: "Refresh token baru (sekali pakai)" }),
  tokenType: t.Literal("Bearer"),
  expiresIn: t.Integer({ description: "Masa berlaku access token dalam detik" }),
  refreshExpiresIn: t.Integer({ description: "Masa berlaku refresh token dalam detik" }),
  user: authUserSchema,
});

export const successTokenSchema = t.Object({
  success: t.Literal(true),
  data: tokenPairSchema,
});

export const successLogoutSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    message: t.String(),
  }),
});

export type AuthUser = Static<typeof authUserSchema>;
export type TokenPair = Static<typeof tokenPairSchema>;
