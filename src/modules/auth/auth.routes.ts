import { Elysia, t } from "elysia";
import { db } from "../../db/index.ts";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_SECRET,
  REFRESH_TOKEN_TTL_DAYS,
} from "../../common/env.ts";
import { signAccessToken } from "../../utils/jwt.ts";
import { presignPutUpload } from "../../utils/s3.ts";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../utils/errors.ts";
import { authBasePlugin, requireAccessToken } from "./auth.plugin.ts";
import { createAuthRepository } from "./auth.repo.ts";
import { createAuthService } from "./auth.service.ts";
import { createProfileStore } from "./profile.store.ts";
import {
  changePassword,
  getMe,
  preparePhotoUpload,
  updateMe,
} from "./profile.service.ts";
import {
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  successLogoutSchema,
  successTokenSchema,
  type AuthUser,
} from "./auth.model.ts";
import {
  changePasswordBodySchema,
  photoPresignBodySchema,
  successMeSchema,
  successPasswordSchema,
  successPhotoPresignSchema,
  updateMeBodySchema,
} from "./profile.model.ts";

const errorSchema = t.Object({
  success: t.Literal(false),
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Array(t.Unknown()),
  }),
});

/** Autentikasi yang menolak perubahan profil oleh murid. */
function requireProfileWrite() {
  return function authorize({ authUser }: { authUser: { id: string; role: string } | null }) {
    if (!authUser) {
      throw new UnauthorizedError(
        "Autentikasi diperlukan: sertakan header Authorization: Bearer <access_token>",
      );
    }
    if (authUser.role === "murid") {
      throw new ForbiddenError(
        "Murid tidak dapat mengubah profil. Hubungi pihak sekolah untuk perubahan data.",
      );
    }
  };
}

const refreshTokenTtlSeconds = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

const authService = createAuthService({
  repo: createAuthRepository(db),
  verify: (password, hash) => Bun.password.verify(password, hash),
  refreshTokenTtlDays: REFRESH_TOKEN_TTL_DAYS,
});

const profileDeps = {
  store: createProfileStore(db),
  verify: (password: string, hash: string) =>
    Bun.password.verify(password, hash),
  hash: (password: string) => Bun.password.hash(password),
  photo: { presign: (ext: string) => presignPutUpload(ext) },
};

function deviceInfo(userAgent: string | undefined): string | null {
  const value = userAgent?.trim() ?? "";
  return value.length > 0 ? value.slice(0, 300) : null;
}

function tokenPair(
  accessToken: string,
  refreshToken: string,
  user: AuthUser,
) {
  return {
    success: true as const,
    data: {
      accessToken,
      refreshToken,
      tokenType: "Bearer" as const,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresIn: refreshTokenTtlSeconds,
      user,
    },
  };
}

export const authModule = new Elysia({ prefix: "/auth" })
  .use(authBasePlugin(JWT_SECRET))
  .post(
    "/login",
    async ({ body, headers }) => {
      const { user, session } = await authService.login(
        body.identifier,
        body.password,
        deviceInfo(headers["user-agent"]),
      );
      const accessToken = await signAccessToken({
        userId: user.id,
        role: user.role,
        sessionId: session.sessionId,
      });
      return tokenPair(accessToken, session.refreshToken, user);
    },
    {
      body: loginBodySchema,
      response: { 200: successTokenSchema },
      detail: {
        summary: "Masuk — terbitkan pasangan access & refresh token",
        description:
          "Memverifikasi email & kata sandi lalu menerbitkan access token (15 menit) dan " +
          "refresh token (sekali pakai, masa berlaku default 30 hari). Refresh token disimpan " +
          "di database sebagai hash SHA-256. Akun demo memakai kata sandi `rahasia123`.",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Login berhasil, pasangan token diterbitkan" },
          "400": { description: "Body tidak valid" },
          "401": { description: "Email atau kata sandi salah" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/refresh",
    async ({ body, headers }) => {
      const { user, session } = await authService.rotate(
        body.refreshToken,
        deviceInfo(headers["user-agent"]),
      );
      const accessToken = await signAccessToken({
        userId: user.id,
        role: user.role,
        sessionId: session.sessionId,
      });
      return tokenPair(accessToken, session.refreshToken, user);
    },
    {
      body: refreshBodySchema,
      response: { 200: successTokenSchema },
      detail: {
        summary: "Rotasi refresh token (token pair baru)",
        description:
          "Menerima refresh token, mencabut token lama, lalu menerbitkan access token baru dan " +
          "refresh token baru dalam keluarga (family) yang sama. Bila refresh token lama dipakai " +
          "ulang, seluruh keluarga token dicabut dan respons 401 TOKEN_REUSE_DETECTED.",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Pasangan token baru diterbitkan" },
          "400": { description: "Body tidak valid" },
          "401": { description: "Refresh token tidak valid/kedaluwarsa/dipakai ulang" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/logout",
    async ({ body }) => {
      await authService.revoke(body.refreshToken);
      return {
        success: true as const,
        data: { message: "Berhasil keluar dari perangkat ini" },
      };
    },
    {
      body: logoutBodySchema,
      response: { 200: successLogoutSchema },
      detail: {
        summary: "Keluar dari perangkat ini",
        description:
          "Mencabut refresh token perangkat saat ini (tidak memengaruhi perangkat lain).",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Sesi perangkat dicabut" },
          "400": { description: "Body tidak valid" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/logout-all",
    async ({ authUser }) => {
      await authService.revokeAll(authUser!.id);
      return {
        success: true as const,
        data: { message: "Berhasil keluar dari seluruh perangkat" },
      };
    },
    {
      beforeHandle: requireAccessToken(),
      response: { 200: successLogoutSchema },
      detail: {
        summary: "Keluar dari seluruh perangkat",
        description:
          "Mencabut seluruh refresh token milik pengguna yang sedang terautentikasi " +
          "(memerlukan access token pada header Authorization).",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Semua sesi dicabut" },
          "401": { description: "Access token tidak disertakan / tidak valid" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .get(
    "/me",
    async ({ authUser }) => {
      const data = await getMe(profileDeps, authUser!.id);
      return { success: true as const, data };
    },
    {
      beforeHandle: requireAccessToken(),
      response: {
        200: successMeSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Profil saya",
        description: "Mengembalikan profil pengguna yang sedang terautentikasi.",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Profil dimuat" },
          "401": { description: "Access token tidak disertakan / tidak valid" },
          "404": { description: "Pengguna tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .patch(
    "/me",
    async ({ body, authUser }) => {
      const data = await updateMe(profileDeps, authUser!.id, body);
      return { success: true as const, data };
    },
    {
      beforeHandle: requireProfileWrite(),
      body: updateMeBodySchema,
      response: {
        200: successMeSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Ubah profil saya",
        description:
          "Memperbarui nama lengkap dan/atau tautan foto profil. Kirim photoUrl kosong/null untuk menghapus foto.",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Profil diperbarui" },
          "400": { description: "Nama kosong / nilai tidak valid" },
          "401": { description: "Access token tidak disertakan / tidak valid" },
          "404": { description: "Pengguna tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/me/password",
    async ({ body, authUser }) => {
      const data = await changePassword(profileDeps, authUser!.id, body);
      return { success: true as const, data };
    },
    {
      beforeHandle: requireProfileWrite(),
      body: changePasswordBodySchema,
      response: {
        200: successPasswordSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Ubah kata sandi saya",
        description:
          "Mengganti kata sandi setelah memverifikasi kata sandi lama. Kata sandi baru minimal 6 karakter dan tidak boleh sama dengan lama.",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Kata sandi diperbarui" },
          "400": { description: "Kata sandi lama salah / kata sandi baru tidak valid" },
          "401": { description: "Access token tidak disertakan / tidak valid" },
          "404": { description: "Pengguna tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  )
  .post(
    "/me/photo",
    async ({ body, authUser }) => {
      await getMe(profileDeps, authUser!.id);
      const data = await preparePhotoUpload(profileDeps, body);
      return { success: true as const, data };
    },
    {
      beforeHandle: requireProfileWrite(),
      body: photoPresignBodySchema,
      response: {
        200: successPhotoPresignSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
      },
      detail: {
        summary: "Siapkan unggah foto profil",
        description:
          "Menerbitkan presigned PUT URL (S3/MinIO) untuk foto profil (PNG/JPG/WEBP/GIF, maks 5 MB). " +
          "Client mengunggah lalu memanggil PATCH /auth/me dengan `photoUrl` dari respons.",
        tags: ["Authentication"],
        responses: {
          "200": { description: "Presigned URL diterbitkan" },
          "400": { description: "Jenis/ukuran foto tidak didukung" },
          "401": { description: "Access token tidak disertakan / tidak valid" },
          "404": { description: "Pengguna tidak ditemukan" },
          "500": { description: "Kesalahan server" },
        },
      },
    },
  );
