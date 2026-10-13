# Spec Tahap 1 — SaaS Arsip Digital Sekolah (Compliance-First)

> Dokumen ini adalah spesifikasi tahap awal (MVP) untuk produk SaaS arsip digital sekolah swasta.
> Sumber kebutuhan: `ringkasan_dokumen_digital_sekolah.md`.

---

## 1. Ringkasan Produk

**Nama kerja:** Arsip Digital Sekolah
**Positioning:** SaaS self-serve untuk sekolah swasta — repositori arsip yang otomatis menjaga sekolah tetap patuh (UU PDP, retensi arsip, struktur folder) tanpa perlu tim IT.

**Prinsip kunci:**

- Storage sendiri penuh di **S3-compatible region Indonesia** (tidak bergantung Belajar.id).
- Compliance sebagai fitur produk, bukan lampiran.
- Self-serve: sekolah bisa onboarding sendiri tanpa proses sales.

**Pitch:** *"Sistem arsip sekolah yang otomatis membuat sekolah Anda lolos audit dan tidak kena sanksi PDP."*

---

## 2. Dasar Hukum yang Dipetakan ke Fitur

| Kewajiban (regulasi) | Masalah sekolah | Fitur SaaS |
|---|---|---|
| Arsip terpadu & akuntabel (Permendikdasmen No. 7/2026) | Arsip tersebar di flashdisk, Drive pribadi, kertas | Repositori terpusat + audit trail |
| File < 100 MB, larangan duplikat/.apk/video, pembersihan 2x/tahun | Guru asal upload, file hilang saat pembersihan | Policy engine (validasi ukuran, dedup, block ekstensi) + notifikasi sebelum purge |
| Server wajib di Indonesia (PP No. 71/2019) | Tidak paham & tidak bisa membuktikan data residency | Infra di region Indonesia + laporan residency |
| Retensi 5 tahun (BOS) & permanen (raport/ijazah) | Tidak ada sistem retensi, arsip terhapus sembarangan | Retention policy engine + legal hold |
| Wajib backup ganda ke external HDD/server lokal | Backup manual, tidak konsisten | Backup berlapis + agent on-prem (fase lanjutan) |
| Standarisasi folder (TA > Semester > Kelas > Jenis) | Struktur folder berantakan antar guru | Template folder otomatis per tahun ajaran |
| SOP keamanan & hak akses via SK Kepala Sekolah | Tidak ada kontrol akses, potensi kebocoran | RBAC + bukti SK + audit log |

> **Catatan:** dokumen sumber adalah ringkasan internal. Nomor/tahun regulasi wajib diverifikasi ke sumber resmi sebelum dipakai sebagai klaim marketing.

---

## 3. Target Pengguna & Hak Akses (RBAC)

| Role | Tugas utama | Hak |
|---|---|---|
| Kepala Sekolah | Pemilik kebijakan, setujui SK | Super admin, lihat dashboard compliance |
| Kepala TU | Kelola akses & arsip harian | Admin operasional (sesuai SK) |
| Guru/Staff | Upload & akses arsip terbatas | Upload/lihat sesuai kelas/bidang |
| Operator | Entri data & scan dokumen | Upload terbatas |
| Auditor | Verifikasi kepatuhan | Read-only + ekspor bukti |

---

## 4. Ruang Lingkup MVP (Fase 1)

1. **Multi-tenant + onboarding self-serve** — buat sekolah, undang user, peran otomatis.
2. **Struktur folder otomatis** — generate `Tahun Ajaran > Semester > Kelas > Jenis Dokumen` saat setup.
3. **Upload & metadata** — drag-drop + kamera scan (mobile), multipart/resumable untuk file besar.
4. **Policy engine** (inti compliance):
   - Validasi ukuran **< 100 MB** (configurable per tenant).
   - **Block ekstensi** berbahaya (.apk, .exe, dll) + video non-relevan.
   - **Deteksi duplikat** via hash konten.
   - Peringatan sebelum "pembersihan otomatis" (meniru siklus 2x/tahun).
5. **Dashboard skor kepatuhan** — indikator: folder rapi, file compliant, akses terkontrol, backup aktif.
6. **RBAC + audit log** — setiap aksi tercatat; dasar akses = SK Kepala Sekolah (unggah SK sebagai bukti).
7. **Kategori retensi dasar** — tag dokumen → masa simpan (BOS 5 tahun, akademik permanen) + **legal hold** (anti-hapus).
8. **Pencarian & filter** (full-text PostgreSQL).
9. **Notifikasi** in-app/email (undangan, file mendekati kedaluwarsa, perubahan akses).

### Di luar lingkup Fase 1

- SSO Belajar.id, versioning dokumen, OCR/full-text lanjutan, retention lifecycle otomatis penuh.
- Backup on-prem / external HDD agent.
- E-Ijazah, e-Raport, arsip keuangan/BOS khusus, integrasi Dapodik.

---

## 5. Arsitektur Teknis

- **Monorepo** (Turborepo): `apps/web` (Next.js) + `apps/api` (NestJS) + `packages/shared`.
- **DB:** PostgreSQL + Prisma. Multi-tenancy awal via **row-level** (`school_id` di semua tabel), RLS opsional.
- **Storage:** S3-compatible **region Indonesia** (opsi: AWS `ap-southeast-3` Jakarta, GCP `asia-southeast2`, atau lokal seperti Biznet Gio / Telkom). *Provider final perlu dikonfirmasi.*
- **Queue/worker:** Redis + BullMQ — virus scan (ClamAV), hashing/dedup, thumbnail, OCR.
- **Auth:** Auth.js (Next.js). SSO Belajar.id menyusul di Fase 2.
- **Infra:** Docker, IaC (Terraform), TLS + enkripsi at-rest (SSE), audit log append-only.
- **Backup:** snapshot DB + versioning bucket; target DR lintas zona.

### Entitas Data Inti

```
School, User, Membership, Role
AcademicYear, Semester, Classroom, DocumentType, Folder
Document, DocumentVersion, RetentionPolicy, LegalHold
AuditLog, ShareLink
```

---

## 6. Checklist Compliance

- [ ] Data residency Indonesia (region + dokumen bukti).
- [ ] UU PDP: enkripsi, DPA, kontrol akses, hak hapus/ekspor.
- [ ] Pendaftaran PSE Kominfo.
- [ ] Audit trail & log akses.
- [ ] Rencana Backup & DR (target RPO/RTO).
- [ ] ISO 27001 (target Fase 2–3).
- [ ] Retensi: BOS min. 5 tahun; akademik/ijazah permanen.

---

## 7. Model Bisnis (Self-Serve)

- Free trial → langganan per sekolah **per tahun ajaran**, tier berdasarkan **kuota storage & jumlah user**.
- Add-on: storage tambahan, E-Ijazah, backup on-prem.

---

## 8. Roadmap & Estimasi

| Tahap | Durasi | Hasil |
|---|---|---|
| Setup & desain | 1–2 minggu | Monorepo, skema DB, desain UI |
| Core arsip + auth + RBAC | 3–6 minggu | Upload, folder otomatis, multi-tenant |
| Policy engine + compliance dashboard + audit | 7–9 minggu | Fitur pembeda utama |
| Retention dasar + notifikasi + backup | 10–11 minggu | Siap beta |
| Beta pilot | minggu 12 | 2–3 sekolah pilot |

---

## 9. Risiko Utama

- **Adopsi guru rendah** → investasi di UX mobile & scan dokumen.
- **Klaim regulasi harus akurat** → verifikasi ke regulasi resmi sebelum dipakai marketing.
- **Biaya storage region Indonesia** relatif lebih mahal → monitor margin tiap tier.
- **Belajar.id** tidak lagi blocker (storage sendiri), kini jadi nilai tambah.

---

## 10. Pertanyaan Terbuka

1. Nama produk final & domain.
2. Provider cloud Indonesia spesifik (AWS Jakarta / GCP / lokal).
3. Apakah scan dokumen fisik (OCR) harus ada di MVP?
4. Bahasa: hanya Indonesia atau perlu multi-bahasa?
5. Target jumlah sekolah untuk pilot pertama.

---

## 11. Keputusan yang Sudah Ditetapkan

| Topik | Keputusan |
|---|---|
| Fokus MVP | Arsip + Compliance (core) |
| Strategi penyimpanan | Storage sendiri penuh (S3 Indonesia) |
| Segmen & model bisnis | Sekolah swasta, self-serve SaaS |
| Stack | Next.js + NestJS + PostgreSQL + S3 lokal |
| Backup on-prem | Opsional (fase lanjutan) |
