# E2E Test — Arsip Digital Sekolah

Suite **Playwright** untuk menguji sistem secara end-to-end. Dua project:

| Project | Lokasi | Cakupan |
|---|---|---|
| `api` | `tests/api/` | End-to-end lewat HTTP API (`APIRequestContext`) |
| `web` | `tests/web/` | Alur browser (Chromium): daftar → buat sekolah → tahun ajaran/semester/kelas → generate folder → unggah → legal hold → versioning; alur **E-Raport** (siswa → mapel → nilai → raport PDF); alur **E-Ijazah** (batch → terbitkan → verifikasi); proteksi rute; smoke halaman |

## Prasyarat

1. PostgreSQL berjalan (mis. Docker `arsip-pg`) dengan migrasi + seed diterapkan:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

2. File `.env` di root berisi `DATABASE_URL` dan `JWT_SECRET`.

3. Install browser Chromium (sekali saja):

   ```bash
   npm run install:browsers
   ```

## Menjalankan

```bash
# dari root repo
npm run test:e2e        # semua project (API + web)
npm run test:e2e:api    # hanya API
npm run test:e2e:web    # hanya browser (web)
```

Atau dari `apps/e2e`:

```bash
npx playwright test                 # semua
npx playwright test --project=api
npx playwright test --project=web --headed   # tampilkan browser
npx playwright test tests/api/05-documents-uploads.spec.ts   # satu file
npx playwright show-report          # laporan HTML
```

## Cara kerja server

`playwright.config.ts` mengonfigurasi `webServer`:

- **API** — `npm run build --workspace @arsip/api && npm run start --workspace @arsip/api`
  (port 3001). Tunggu sampai `http://localhost:3001/api/v1/health` merespons.
- **Web** — `npm run dev --workspace @arsip/web` (port 3000).

`reuseExistingServer: !CI` berarti server yang sudah berjalan di port tersebut akan
dipakai ulang saat lokal, tetapi selalu dimulai ulang di CI.

Override alamat bila perlu:

```bash
API_ORIGIN=http://localhost:4001 WEB_URL=http://localhost:4000 npx playwright test
```

## Struktur test

```
tests/
├── api/
│   ├── fixtures.ts                  # fixture: prefix otomatis /api/v1 + re-export expect
│   ├── helpers.ts                   # pembuat data + alur upload/download
│   ├── 01-health.spec.ts
│   ├── 02-auth.spec.ts
│   ├── 03-schools.spec.ts
│   ├── 04-academic-folders.spec.ts
│   ├── 05-documents-uploads.spec.ts
│   ├── 06-rbac.spec.ts
│   ├── 07-retention-compliance.spec.ts
│   ├── 08-eraport.spec.ts             # E-Raport: siswa, mapel, nilai, raport PDF
│   ├── 09-versioning.spec.ts          # Versioning: riwayat, unduh, bandingkan, restore
│   └── 10-eijazah.spec.ts             # E-Ijazah: batch, generate, terbitkan, cabut, verifikasi, PDF
└── web/
    ├── home.spec.ts                 # smoke halaman landing
    ├── guard.spec.ts                # proteksi rute (middleware redirect ke /login)
    ├── flow.spec.ts                 # daftar -> sekolah -> akademik -> folder -> unggah -> legal hold
    ├── eraport.spec.ts              # alur E-Raport di browser (siswa -> nilai -> raport PDF)
    ├── eijazah.spec.ts              # alur E-Ijazah di browser (batch -> terbitkan -> verifikasi)
    └── versioning.spec.ts           # alur versioning di browser (catatan -> pulihkan -> bandingkan)
```

### Catatan fixture API

Playwright menyelesaikan URL dengan `new URL(path, baseURL)`, sehingga path absolut
(`/health`) akan menghapus path pada `baseURL`. `tests/api/fixtures.ts` membungkus
`request` dan menambahkan prefix `/api/v1` ke setiap path relatif, agar test cukup
menulis `/schools/:id` dsb. URL absolut (presigned URL `/files`) tidak diubah.

Karena itu, **selalu import `test`/`expect` dari `./fixtures`** pada test API, bukan
langsung dari `@playwright/test`.

Cookie sesi (dari `register`/`login`) tersimpan di konteks `request`, sehingga
permintaan berikutnya pada test yang sama otomatis terautentikasi. Untuk menguji
akses anonim (mis. ekspektasi `401`), gunakan fixture `anonRequest` (konteks tanpa
cookie).

## Sifat test

- **Mandiri**: setiap test membuat user + sekolah unik (email/slug berbasis timestamp
  + random), sehingga aman dijalankan berulang tanpa reset database.
- **Serial** (`workers: 1`) agar deterministik meski berbagi satu database.
- **Tanpa asumsi jumlah global**: test tidak bergantung pada jumlah data seed, kecuali
  bahwa minimal ada satu jenis dokumen sistem (dari seed).
