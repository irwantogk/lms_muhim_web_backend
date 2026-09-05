---
description: Aturan standar penulisan konvensi Git Commit dan Workflow Git untuk proyek LMS SMA.
globs: "**/*"
---

# Git Commit & Workflow Skill Guidelines
Dokumen ini mendefinisikan standar penulisan pesan commit (*Conventional Commits*) serta alur kerja Git (*Git Workflow*) yang wajib dipatuhi dalam pengembangan LMS SMA.

---

## 1. Format Conventional Commits
Setiap pesan commit wajib mengikuti struktur format berikut:
```text
<type>(<scope>): <deskripsi singkat>
[opsional body]
```

**Type yang Diizinkan:**
  * ```feat```: Fitur baru untuk pengguna atau sistem (misal: ```feat(attendance): tambah endpoint scan QR code murid```).
  * ```fix```: Perbaikan bug atau kesalahan logika.
  * ```refactor```: Perubahan kode yang tidak mengubah perilaku API/fitur (pemberkasan, optimasi query).
  * ```schema```: Perubahan struktur database, migrasi Drizzle, atau penambahan tabel baru.
  * ```docs```: Perubahan dokumentasi (termasuk PRD, README, atau file SKILL.md).
  * ```chore```: Tugas pemeliharaan, pembaruan dependency, atau konfigurasi build.
  * ```style```: Perubahan format kode, linter, formatting (tanpa mengganggu logika).

**Scope yang Berlaku:**
Gunakan nama modul/fokus pekerjaan sebagai scope:
  * ```auth```, ```users```, ```classes```, ```schedules```, ```attendance```, ```materials```, ```assignments```, ```forum```, ```reports```, ```db```, ```config```.

## 2. Aturan & Format Pesan Commit
  1. **Bahasa**: Gunakan Bahasa Indonesia atau Bahasa Inggris secara konsisten dalam satu tim.
  2. **Huruf Kecil**: Gunakan huruf kecil untuk tipe dan deskripsi singkat.
  3. **Tanpa Titik**: Jangan mengakhiri pesan judul commit dengan tanda titik (.).
  4. **Kejelasan**: Tulis deskripsi yang secara langsung menjelaskan apa perubahan yang dilakukan.

**Contoh Commit yang Baik:**
```bash
git commit -m "feat(attendance): tambahkan validasi waktu kadaluarsa kode presensi"
git commit -m "schema(db): tambahkan tabel parent_students dan relasinya"
git commit -m "fix(assignments): koreksi perhitungan skor tugas pilihan ganda"
```

**Contoh Commit yang Dilarang:**
  * ```git commit -m "fix bug"``` (Terlalu umum)
  * ```git commit -m "update backend"``` (Tidak spesifik)
  * ```git commit -m "WIP"``` (Tidak menjelaskan fitur yang dikerjakan)

## 3. Workflow Percabangan (Branching Strategy)
  1. **Branch Utama:**
    * ```main```: Menyimpan kode stabil yang siap dideploy ke Railway.
    * ```development``` (opsional): Percabangan staging sebelum rilis ke ```main```.
  2 **Format Penamaan Feature Branch:**
    * ```feat/<nama-fitur>``` (contoh: ```feat/attendance-qr-scanner```)
    * ```fix/<nama-bug>``` (contoh: ```fix/assignment-score-calculation```)
    * ```schema/<nama-perubahan>``` (contoh: ```schema/add-forum-tables```)
  3. **Pull Request (PR):**
    * Setiap Pull Request harus ditinjau (code review) sebelum digabungkan (merge) ke branch utama.
    * Pastikan tidak ada konflik dan migrasi database sudah diverifikasi.
    