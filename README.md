# Arsip Digital Sekolah

SaaS **compliance-first** untuk arsip digital sekolah swasta — repositori yang otomatis
menjaga sekolah tetap patuh (UU PDP, retensi arsip, struktur folder) tanpa perlu tim IT.

> Sumber kebutuhan: `ringkasan_dokumen_digital_sekolah.md`
> Spesifikasi: `spec-tahap-1.md` (MVP), `spec-tahap-2.md` (lanjutan)
> API: `openapi.yaml`

## Struktur Monorepo

```
.
├── apps/
│   ├── api/          # Backend NestJS (REST /api/v1)
│   ├── web/          # Frontend Next.js
│   └── e2e/          # End-to-end test (Playwright)
├── packages/
│   └── shared/       # Tipe & konstanta bersama
├── prisma/
│   ├── schema.prisma # Skema database (Tahap 1 + 2)
│   └── seed.ts       # Data awal (planes, jenis dokumen, demo sekolah)
├── openapi.yaml      # Spesifikasi OpenAPI
├── spec-tahap-1.md
├── spec-tahap-2.md
└── turbo.json
```

## Prasyarat

- Node.js >= 20
- PostgreSQL (disarankan versi terbaru) — **region Indonesia** untuk produksi
- Object storage S3-compatible (region Indonesia)

## Menjalankan

```bash
# 1. Install dependensi
npm install

# 2. Siapkan env
cp .env.example .env
# Wajib: isi JWT_SECRET (min. 32 karakter acak)

# 3. Generate Prisma Client
npm run db:generate

# 4. Migrasi + isi data awal
npm run db:migrate
npm run db:seed

# 5. Jalankan semua app (web + api) via Turbo
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/api/v1
- Health check: http://localhost:3001/api/v1/health

### Environment

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ya | PostgreSQL (region Indonesia di produksi) |
| `JWT_SECRET` | ya | Secret JWT (min. 32 karakter) |
| `PORT` | tidak | Port API (default 3001) |
| `NEXT_PUBLIC_API_URL` | ya (web) | Base URL API |
| `COOKIE_DOMAIN` | tidak | Domain cookie sesi. Isi `.domain.id` bila web & API beda subdomain; kosong = host-only (localhost) |
| `EIJAZAH_SIGNING_KEY` | tidak | Kunci HMAC untuk tanda tangan elektronik ijazah (fallback: `JWT_SECRET`) |
| `PUBLIC_APP_URL` | tidak | Base URL web untuk tautan/QR verifikasi ijazah (default `http://localhost:3000`) |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | tidak | Bila kosong, API memakai penyimpanan lokal `.storage/` (development) |

### Penyimpanan (storage)

- **Produksi**: isi `S3_BUCKET` + `S3_ENDPOINT` → file disimpan di object storage
  S3-compatible (region Indonesia), akses unduh via presigned URL.
- **Development**: tanpa S3, file disimpan di `.storage/` dan diunduh via
  `GET /api/v1/files?key=<storageKey>`.

## Modul API (Tahap 1 — MVP)

Semua endpoint di bawah sudah terimplementasi pada `apps/api` dan sesuai `openapi.yaml`:

| Modul | Ringkasan |
|---|---|
| **Auth** | register, login, `me`, logout — JWT via Bearer **dan** cookie `httpOnly` (forgot/reset/verify = stub 501) |
| **Schools** | buat sekolah (+ membership kepala sekolah + langganan trial + aturan retensi default, transaksional), get/update, settings, storage, lookup slug |
| **Members** | daftar, undang, ubah role/status, hapus, terima undangan (RBAC: hanya kepala sekolah untuk role sensitif) |
| **Academic** | tahun ajaran, semester, kelas, jenis dokumen (CRUD + aktivasi tahun ajaran) |
| **Folders** | generate struktur otomatis (Arsip > Administrasi > TA > Semester > Kelas > Jenis), tree, isi folder, CRUD |
| **Documents** | list/filter, create, update, soft delete, restore, versions, audit-trail, download, check-duplicate, `POST /policy/validate` |
| **Versioning** | riwayat versi, detail versi, unduh versi lama, bandingkan (`from`/`to`), pulihkan versi menjadi versi baru (+ catatan perubahan) |
| **Uploads** | initiate → content (multipart) → complete (SHA-256 + dedup per sekolah) → abort/status/part |
| **Retention** | antrean pemusnahan, aturan retensi, preview, enqueue, approve/reject, pengaturan |
| **Compliance** | skor kepatuhan, riwayat snapshot, rincian check, laporan CSV |
| **Audit** | riwayat audit tingkat sekolah (`GET /schools/{id}/audit-logs`; kepala sekolah/admin/auditor) |

### Alur unggah dokumen

```
POST /documents                       # opsional: buat metadata dokumen lebih dulu
POST /uploads/initiate                # documentId (versi baru) ATAU documentTypeId+folderId (dokumen baru)
POST /uploads/{id}/content            # kirim binary (multipart field "file")
POST /uploads/{id}/complete           # hitung sha256, deteksi duplikat, simpan versi
```

- Bila `documentId` tidak dikirim saat initiate, dokumen dibuat otomatis saat complete.
- Duplikat byte identik per sekolah tidak dibuat ulang (`deduplicated: true`).
- Versi baru pada dokumen yang sama menambah `versionNumber`.
- Catatan perubahan per versi (`changeNote`) dapat dikirim saat `POST /uploads/initiate`.
- Kuota penyimpanan sekolah bertambah saat file benar-benar tersimpan.

## Modul API (Tahap 2)

| Modul | Ringkasan |
|---|---|
| **E-Raport** | data induk siswa (CRUD, soft delete, impor CSV), mata pelajaran, penugasan siswa ke kelas, entri nilai per mapel/term, generate raport PDF per kelas, unduh PDF |
| **E-Ijazah** | batch per tahun ajaran, generate sertifikat untuk siswa terdaftar, terbitkan + tanda tangan elektronik (HMAC-SHA256), cabut ijazah, unduh PDF ber-QR, verifikasi publik via nomor seri |
| **Versioning** | riwayat versi + catatan perubahan, detail versi, unduh versi lama, bandingkan dua versi, pulihkan versi lama menjadi versi baru |

Alur E-Raport: **tahun ajaran → semester + kelas → data siswa → mata pelajaran →
penugasan siswa ke kelas → entri nilai → generate raport (PDF)**.

- Nilai unik per (siswa, kelas, mata pelajaran, term); input ulang bersifat *upsert*
  (`POST /classrooms/{id}/grades` untuk satu nilai, `/grades/bulk` untuk massal).
- Raport bersifat *idempoten*: generate ulang menimpa berkas dan memperbarui baris
  `report_cards` yang sudah ada (tidak menambah duplikat).
- PDF dibuat dengan `pdfkit` lalu disimpan lewat `StorageService` (S3-compatible /
  disk lokal), dan diunduh via `GET /report-cards/{id}/pdf`.
- Soft delete siswa: `DELETE /students/{id}` menandai status `inactive` (nilai &
  raport tetap utuh sebagai arsip akademik permanen).

Alur versioning dokumen: **unggah berkas baru ke dokumen yang sama → `versionNumber`
naik → lihat riwayat → unduh/bandingkan → pulihkan** (`POST
/documents/{id}/versions/{versionId}/restore`).

- Restore bersifat *additive*: versi lama tidak dihapus; versi hasil pemulihan dibuat
  baru (`versionNumber = maksimum + 1`) dan menjadi `currentVersion`.
- Karena byte-nya identik, versi hasil restore memakai ulang `storageKey` versi asal
  (tidak menambah kuota).
- `GET /documents/{id}/versions/compare?from=&to=` mengembalikan `contentChanged`,
  `sizeDeltaBytes`, dan `metadataChanges` (perbandingan konten via hash).
- `GET /documents/{id}/versions/{versionId}/download` mengalirkan berkas versi mana pun
  (mode S3: redirect presigned).

Alur E-Ijazah: **batch per tahun ajaran → generate sertifikat (status `draft`) →
terbitkan + tanda tangan → verifikasi publik / unduh PDF**.

- Satu batch per (sekolah, tahun ajaran); pembuatan ulang bersifat *idempoten*.
- Generate membuat sertifikat untuk seluruh siswa terdaftar di kelas pada tahun
  ajaran tsb (unik per siswa); generate ulang melewati siswa yang sudah punya
  sertifikat.
- Nomor seri unik berformat `IJZ-<kode sekolah>-<tahun>-<urut>`.
- Status sertifikat: `draft → issued → revoked`. Terbitkan/mencabut hanya untuk
  kepala sekolah / kepala tata usaha.
- Tanda tangan elektronik memakai HMAC-SHA256 atas `contentHash` (bukti keutuhan
  data). Integrasi X.509/PKI/BSrE direncanakan terpisah.
- PDF ijazah dibuat saat permintaan (`GET /eijazah/certificates/{id}/pdf`) dengan
  `pdfkit` + QR verifikasi, tanpa disimpan ke storage.
- `GET /verify/{serial}` (publik, tanpa autentikasi) mengembalikan `valid`, `status`,
  nama siswa, dan nama sekolah.

## Aplikasi Web (MVP)

Frontend Next.js (App Router) sederhana untuk alur inti:

| Rute | Fungsi |
|---|---|
| `/` | Landing + ringkasan fitur MVP |
| `/login` | Masuk / daftar akun |
| `/dashboard` | Daftar sekolah milik pengguna + form buat sekolah |
| `/schools/[schoolId]` | Skor kepatuhan, penyimpanan, **tahun ajaran/semester/kelas**, struktur folder (generate), unggah dokumen (+ catatan perubahan), daftar dokumen + **legal hold**, **versioning** (riwayat/unduh/bandingkan/pulihkan), **jejak audit**, aturan retensi |
| `/schools/[schoolId]/students` | **E-Raport**: data siswa (+ impor CSV), mata pelajaran, penugasan kelas, entri nilai, generate & unduh raport PDF |
| `/schools/[schoolId]/eijazah` | **E-Ijazah**: batch per tahun ajaran, generate sertifikat, terbitkan/cabut, unduh PDF, verifikasi nomor seri |
| `/verify/[serial]` | **Verifikasi publik ijazah** (tanpa login): valid/tidak + metadata |

- Autentikasi memakai cookie `httpOnly` (`arsip_token`) yang di-set API saat login/register;
  tidak ada token di JavaScript (aman dari XSS). Klien API lain tetap dapat memakai Bearer token.
- Rute privat (`/dashboard`, `/schools/*`) dilindungi `middleware.ts` Next.js: tanpa sesi dialihkan ke `/login`.
- Base URL API dibaca dari `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/api/v1`).
- Alur web (arsip): **tahun ajaran → (aktifkan) → semester + kelas → generate struktur folder → unggah → legal hold → jejak audit**.
- Alur web (E-Raport): **data siswa → mata pelajaran → penugasan kelas → entri nilai → generate raport PDF**.
- Alur web (versioning): **unggah dokumen + catatan perubahan → panel Versioning (pilih dokumen) → unduh/bandingkan versi → pulihkan versi menjadi versi baru**.
- Alur web (E-Ijazah): **pilih tahun ajaran → buat/pilih batch → generate ijazah → terbitkan → verifikasi nomor seri** (halaman publik `/verify/:serial`).

## Perintah Penting

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Jalankan web + api |
| `npm run build` | Build semua paket |
| `npm run typecheck` | Type check semua paket |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Migrasi database (dev) |
| `npm run db:deploy` | Migrasi database (produksi) |
| `npm run db:seed` | Isi data awal |
| `npm run db:studio` | Prisma Studio |
| `npm run test:e2e` | Jalankan semua test E2E (API + web) |
| `npm run test:e2e:api` | Test E2E API saja |
| `npm run test:e2e:web` | Test E2E browser (web) saja |

## Test End-to-End (Playwright)

Test E2E berada di `apps/e2e` (workspace `@arsip/e2e`) dan mencakup:

- **API end-to-end** (`tests/api/`) — alur penuh lewat HTTP: auth, sekolah, akademik &
  struktur folder, dokumen & upload (dedup/policy/download), RBAC, retensi/legal hold,
  skor kepatuhan, serta **E-Raport** (siswa/impor CSV/mapel/nilai/generate PDF) dan
  **E-Ijazah** (batch/generate/terbitkan/cabut/verifikasi/PDF).
- **Alur web (browser)** (`tests/web/`) — daftar → buat sekolah → unggah dokumen →
  lihat dokumen & skor kepatuhan, generate struktur folder, alur **E-Raport**
  (siswa → mapel → nilai → raport PDF), alur **E-Ijazah** (batch → terbitkan →
  verifikasi), proteksi rute, plus smoke halaman.

Playwright otomatis menjalankan API (`npm run start --workspace @arsip/api`) dan web
(`npm run dev --workspace @arsip/web`) lewat `webServer`. Bila server sudah berjalan di
port yang sama, server itu dipakai ulang (kecuali `CI`).

```bash
# Sekali saja: install browser Chromium
npm run install:browsers --workspace @arsip/e2e

# Jalankan seluruh test E2E
npm run test:e2e

# Hanya API / hanya browser (headed)
npm run test:e2e:api
npm run test:e2e:web

# Lihat laporan HTML
npm run report --workspace @arsip/e2e
```

Prasyarat: PostgreSQL berjalan dengan migrasi + seed sudah diterapkan (lihat
"Menjalankan" di atas), serta `.env` berisi `DATABASE_URL` dan `JWT_SECRET`.
Test bersifat mandiri (setiap test membuat user & sekolah unik) sehingga dapat
dijalankan berulang tanpa reset database. Detail selengkapnya ada di
`apps/e2e/README.md`.

## Catatan Kepatuhan

- Data wajib disimpan di **region Indonesia** (PP No. 71/2019).
- Batas ukuran file default **100 MB** (configurable per sekolah).
- Retensi: arsip keuangan/BOS **min. 5 tahun**, arsip akademik/ijazah **permanen**.
- Kontrol akses berbasis role + **SK Kepala Sekolah** sebagai bukti dasar.
