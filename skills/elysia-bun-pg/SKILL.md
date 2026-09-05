---
description: Pedoman pengembangan backend API LMS SMA menggunakan Elysia, Bun, Drizzle ORM, dan PostgreSQL.
---

# Elysia-Bun-PG Backend Skill Guidelines

## Dokumen ini mendefinisikan aturan, standar arsitektur, dan konvensi penulisan kode backend API untuk LMS SMA berbasis **Elysia.js**, **Bun**, **Drizzle ORM**, dan **PostgreSQL**.

## 1. Arsitektur & Struktur Folder

Gunakan struktur modul berbasis domain terpisah untuk menjaga kejelasan
fungsionalitas:

```text
apps/api/src/
├── db/
│   ├── index.ts
│   └── schema.ts           # Definisi tabel PostgreSQL dengan Drizzle ORM
├── modules/
│   ├── auth/               # Login, Logout, Session Token
│   ├── users/              # Kelola akun (Admin, Guru, Murid, Orang Tua)
│   ├── classes/            # Kelas & Keanggotaan murid/guru
│   ├── schedules/          # Jadwal mingguan
│   ├── attendance/         # Sesi absensi & Scan QR/Kode
│   ├── materials/          # Unggah & Pustaka materi
│   ├── assignments/        # Tugas & Koreksi/Nilai
│   ├── forum/              # Topik & Balasan forum
│   └── reports/            # Grafik progres & Export CSV
├── middleware/
│   └── auth.ts             # Verifikasi JWT/Session & RBAC
├── utils/
│   └── storage.ts          # Handling upload file ke Railway Volume
└── index.ts                # App Entry point & Elysia routes registration
```
---

## 2. Aturan Validasi Data & Dokumentasi (TypeBox & Scalar)
#### 1. Mandatory TypeBox Validation:
  * Setiap endpoint **WAJIB** memiliki validasi schema menggunakan @sinclair/typebox (bawaan ElysiaJS via t).
  * Validasi mencakup: body, query, params, headers, dan response.
  * Definisikan kriteria validasi secara spesifik (misal: t.String({ format: 'email' }), t.String({ minLength: 8 })).
#### 2. Dokumentasi API Otomatis via Scalar:
  * Pasang plugin @elysiajs/swagger / Scalar UI pada entry point (index.ts).
  * Setiap route **WAJIB** dilengkapi metadata OpenAPI:
    * ```deails.summary```: Penjelasan singkat fungsi endpoint.
    * ```detail.description```: Penjelasan rinci parameter, alur kerja, dan dampaknya.
    * ```detail.tags```: Pengelompokan endpoint (misal: ['Authentication'], ['Users']).
    * ```detail.responses```: Dokumentasi lengkap status code sukses (200/201) dan error (400, 401, 404, 500).
---

## 3. Skema Database (Drizzle ORM)
Pastikan seluruh Type/Enum dan Foreign Key dikonfigurasi sesuai spesifikasi PRD:
  - Roles: `admin`, `guru`, `murid`, `orang_tua`
  - Attendance Status: `hadir`, `terlambat`, `izin`, `sakit`
  - Material Types: `pdf`, `video`, `dokumen`
  - Assignment Types: `pilihan_ganda`, `esai`, `upload`

Aturan Skema Drizzle:
  - Selalu gunakan `uuid` dengan default `gen_random_uuid()` untuk Primary Key.
  - Sertakan timestamp `created_at` dan `updated_at` pada setiap tabel utama.
  - Atur cascading delete/update secara eksplisit pada relasi Foreign Key.
---

## 4. Autentikasi & Authorization (RBAC)
1. **Password Hashing**: Gunakan native Bun Hashing (Bun.password.hash dan
   Bun.password.verify).
2. **JWT/Session**: Gunakan plugin `@elysiajs/jwt` atau HTTP-only cookie
   session.
3. **Role-Based Access Control (RBAC):** * Terapkan guard middleware untuk
   memeriksa peran pengguna (`role`) sebelum mengeksekusi handler endpoint. *
   **Admin**: Akses penuh kelola user, kelas, mapel, keanggotaan. * **Guru**:
   Membuat sesi presensi, membuat tugas, mengunggah materi, menilai jawaban,
   moderasi forum. * **Murid**: Memindai absensi, membaca materi, mengerjakan
   tugas, menulis forum. * **Orang Tua**: Membaca data presensi dan laporan
   progres anak terikat.
Setiap fitur autentikasi dan manajemen sesi wajib mematuhi mekanisme **Dual-Token dengan Refresh Token Rotation** untuk mendukung keamanan aplikasi mobile secara maksimal.

### A. Spesifikasi & Lifecycle Token
1. **Access Token (Short-lived):**
   - Masa berlaku: **15 menit**.
   - Berisi payload minimal: `userId`, `role`, `sessionId`.
   - Dilarang menyimpan data sensitif (seperti password hash) di dalam payload.
   - Dikirimkan oleh client mobile via header HTTP: `Authorization: Bearer <access_token>`.

2. **Refresh Token (Long-lived):**
   - Masa berlaku: **7 sampai 30 hari**.
   - Berisi payload: `userId`, `tokenFamilyId`, `version`.
   - Dikirimkan dalam request body atau header khusus saat melakukan *token refresh*.

### B. Aturan Database & Session Storage (PostgreSQL)
Refresh Token **WAJIB** disimpan dan dilacak di PostgreSQL (koleksi `sessions` atau `refresh_tokens`) untuk mendukung pembatalan sesi (*session revocation*).

Setiap dokumen token di PostgreSQL harus menyimpan data berikut:
- `userId`: ID pengguna pemilik token.
- `tokenHash`: Hash dari Refresh Token (gunakan SHA-256, **dilarang menyimpan plain text token** di DB).
- `tokenFamilyId`: UUID unik untuk mengelompokkan token dalam satu rantai rotasi.
- `isRevoked`: Boolean (default `false`).
- `expiresAt`: Waktu kedaluwarsa token (manfaatkan **PostgreSQL TTL Index** agar dokumen otomatis terhapus saat kedaluwarsa).
- `deviceInfo` / `userAgent`: Informasi perangkat mobile untuk audit trail.

---

### C. Alur Kerja Rotasi Refresh Token (Refresh Token Rotation)
Saat client mengirimkan permintaan untuk memperbarui Access Token via endpoint `/auth/refresh`:

1. **Validasi Signature & Kedaluwarsa:** Verifikasi Refresh Token yang dikirim client.
2. **Cek Database (Hash Matching):** Cari dokumen session berdasarkan `tokenHash` di PostgreSQL.
3. **Deteksi Reuse Attack (Pencurian Token):**
   - Jika Refresh Token yang dikirim **sudah pernah digunakan sebelumnya** atau bernilai `isRevoked: true`:
     - **TINDAKAN KEAMANAN SANGAT KETAT:** Asumsikan token telah dicuri oleh peretas.
     - **Cabut seluruh rantai token** (`tokenFamilyId`) milik keluarga tersebut di PostgreSQL (`isRevoked = true`).
     - Kembalikan response `401 Unauthorized` dengan kode error `TOKEN_REUSE_DETECTED`.
4. **Penerbitan Token Baru (Pasangan Baru):**
   - Jika token valid dan belum pernah digunakan:
     - Tandai token lama sebagai terpakai / cabut (`isRevoked: true`).
     - Buat pasangan baru: **Access Token Baru** + **Refresh Token Baru** (tetap pertahankan `tokenFamilyId` yang sama).
     - Simpan hash Refresh Token baru ke PostgreSQL.
     - Kembalikan pasangan token baru ke client mobile.

---

### D. Alur Logout & Revokasi Sesi
- **Logout Perangkat Ini (`/auth/logout`):** Tandai `isRevoked = true` pada Refresh Token yang sedang aktif di PostgreSQL.
- **Logout Seluruh Perangkat (`/auth/logout-all`):** Tandai `isRevoked = true` pada **seluruh** dokumen session milik `userId` tersebut.

---

### E. Aturan Implementation pada ElysiaJS
1. **Gunakan `@elysiajs/jwt` Plugin:** Gunakan plugin resmi Elysia untuk melakukan verifikasi dan signing JWT secara asinkron.
2. **Custom Auth Guard Plugin:** Buat macro/plugin Elysia (misal: `.macro({ auth: true })`) untuk memproteksi private route. Jika Access Token tidak valid atau kedaluwarsa, kembalikan `401 Unauthorized` secara otomatis sebelum mencapai layer controller.

---

## 5. Konvensi Endpoint & Validasi Data
Gunakan Schema Validation bawaan Elysia (t dari TypeBox) untuk seluruh payload
request (`body`, `query`, `params`).

**Standar Penamaan Path RESTful:**

- `POST /auth/login` — Autentikasi masuk
- `GET /schedules` — Mengambil jadwal sesuai peran aktif
- `POST /attendance/sessions` — Guru membuat kode absensi
- `POST /attendance/scan` — Murid memindai kode absensi
- `GET /assignments/:id/submissions` — Guru melihat daftar jawaban murid
- `GET /reports/export-csv` — Unduh rekapitulasi nilai/absensi
---

## 6. File Management (Upload & Railway Storage)
- Penanganan file upload (materi PDF/dokumen atau jawaban tugas murid) diproses
  melalui Elysia multipart form-data.
- Simpan file secara fisik di `Railway Volume Path` (misal /app/uploads).
- Simpan lokasi path/URL statis yang terasosiasi di kolom `file_url` pada
  database.
---

## 7. Error Handling & Format Respon
* Global Error Handler:
    * Gunakan fitur .onError() bawaan Elysia di level teratas aplikasi.
    * Petakan setiap Custom Error ke HTTP Status Code secara konsisten:
      * ```ValidationError``` -> ```400 Bad Request```
      * ```UnauthorizedError``` -> ```401 Unauthorized```
      * ```NotFoundError``` -> ```404 Not Found```
      * ```ConflictError``` -> ```409 Conflict```
      * Error tak terduga -> ```500 Internal Server Error``` (Disertai log error internal).
  * Format Standar Response:
    * Response success
      ```json
      {
        "success": true,
        "data": { ... }
      }
      ```
    * Response error
    ```json
    {
      "success": false,
      "error": {
        "code": "ERROR_CODE",
        "message": "Pesan error yang ramah pengguna",
        "details": [] 
      }
    }
    ```
Manfaatkan penanganan eror tersentralisasi menggunakan app.onError() pada
Elysia.
---

## 8. Aturan Pengujian (Testing Strategy)
Menggunakan runner testing bawaan Bun (bun test). Setiap pengerjaan fitur baru **WAJIB** menyertakan file pengujian.
### 1. Unit Testing (tests/unit/):
  * Fokus menguji logika bisnis pada **Service Layer**.
  * **WAJIB** mengisolasi komponen dengan membuat Mock/Stub pada Repository Layer.
  * Uji semua skenario: happy path, edge cases, dan failure scenarios (pemanggilan error yang diharapkan).
### 2. Integration Testing (tests/integration/):
  * Menguji alur penuh dari HTTP Request (Elysia Handler) -> Service -> Repository -> PostgreSQL.
  * Gunakan instance PostgreSQL terpisah untuk testing (misal: PostgreSQL Memory Server atau Test Database Container).
  * Pastikan database dibersihkan (beforeEach / afterEach) agar antar pengujian bersifat independen (isolated test).
  * Uji kecocokan dokumentasi OpenAPI/Scalar dengan HTTP response yang dihasilkan secara riil.
---

## 9. Checklist Akhir Sebelum Menyelesaikan Kode
Sebelum menyatakan pembuatan fitur/webserver selesai, pastikan poin berikut telah terpenuhi:
  * [ ] Apakah kode mematuhi SOLID dan tidak ada bisnis logika di Controller?
  * [ ] Apakah seluruh tipe data terdefinisi tanpa menggunakan ```any```?
  * [ ] Apakah endpoint sudah memiliki validasi TypeBox lengkap (```body```, ```query```, ```params```, ```response```)?
  * [ ] Apakah Scalar OpenAPI metadata sudah terpasang rapi (```summary```, ```description```, ```tags```, ```responses```)?
  * [ ] Apakah Custom Error terdaftar dan ditangani oleh Global Error Handler?
  * [ ] Apakah Unit Test untuk Service Layer memiliki coverage skenario sukses & gagal?
  * [ ] Apakah Integration Test menggunakan bun test berjalan tanpa ada error?
  * [ ] Apakah koneksi PostgreSQL dikelola dengan rapi (connection pooling, graceful shutdown)?

