import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import { users } from "./schema.ts";
import { aesEncrypt, identityHash, normalizeEmail } from "../utils/crypto.ts";

/**
 * Seed hanya untuk ADMIN (bootstrap), dijalankan sekali saat inisialisasi.
 *
 * - Tidak membuat pengguna demo lain — guru/murid/orang tua dibuat sendiri
 *   oleh admin lewat menu "Kelola Data Sekolah".
 * - IDEMPOTEN: bila admin dengan email tsb sudah ada, seed dilewati
 *   (kata sandi tidak pernah di-reset di sini).
 *
 * Konfigurasi via env (fallback hanya untuk development):
 *   ADMIN_EMAIL      (default: admin@cendekia.sch.id)
 *   ADMIN_PASSWORD   (default: rahasia123)
 */
const adminEmailRaw = process.env["ADMIN_EMAIL"] ??
  "admin@cendekia.sch.id";
const adminPassword = process.env["ADMIN_PASSWORD"] ?? "rahasia123";

if (!process.env["ADMIN_PASSWORD"]) {
  console.warn(
    "[seed] ADMIN_PASSWORD tidak diset — memakai sandi default (rahasia123). Segera ganti lewat menu Profil.",
  );
}

const adminEmail = normalizeEmail(adminEmailRaw);
const emailHash = identityHash(adminEmail);

async function bootstrapAdmin() {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailHash, emailHash))
    .limit(1);

  if (existing[0]) {
    console.log(`[seed] Admin sudah ada (${adminEmail}) — tidak ada perubahan.`);
    return;
  }

  const passwordHash = await Bun.password.hash(adminPassword);
  await db.insert(users).values({
    fullName: "Administrator",
    email: aesEncrypt(adminEmail),
    emailHash,
    nisn: null,
    nisnHash: null,
    passwordHash,
    role: "admin",
    isActive: true,
  });

  console.log(`[seed] Admin dibuat: ${adminEmail}`);
  console.log(
    "[seed] Sebaiknya segera ganti kata sandi lewat menu Profil setelah masuk.",
  );
}

await bootstrapAdmin();
