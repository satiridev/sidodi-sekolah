# Spec Tahap 2 — SaaS Arsip Digital Sekolah (Fase Lanjutan)

> Dokumen ini adalah spesifikasi **tahap lanjutan** setelah MVP (`spec-tahap-1.md`) stabil.
> Fokus: integrasi Belajar.id, otomasi retensi, backup berlapis, E-Ijazah/e-Raport, dan perluasan analitik.
> Sumber kebutuhan: `ringkasan_dokumen_digital_sekolah.md`.

---

## 1. Tujuan Tahap 2

Melanjutkan MVP menjadi platform yang:

- **Terhubung ekosistem pendidikan** — SSO Belajar.id untuk guru & siswa.
- **Mengotomasi kepatuhan** — lifecycle retensi & pembersihan berjalan sendiri, bukan cuma tag manual.
- **Aman terhadap bencana** — backup berlapis termasuk ke server lokal / external HDD.
- **Menambah nilai hilir** — E-Ijazah, e-Raport, arsip keuangan/BOS.
- **Skalabel multi-sekolah** — analitik lintas sekolah/yayasan + API publik.

---

## 2. Prasyarat (Definition of Done Tahap 1)

Tahap 2 hanya dimulai bila berikut sudah selesai & teruji:

- [ ] Multi-tenant + RBAC + audit log berjalan stabil.
- [ ] Upload resumable + policy engine (ukuran, ekstensi, dedup) aktif.
- [ ] Struktur folder otomatis + dashboard skor kepatuhan.
- [ ] Retensi dasar (tag + `retention_expires_at`) + legal hold.
- [ ] Backup snapshot DB + versioning bucket berjalan.
- [ ] Minimal 2–3 sekolah pilot aktif memakai sistem.

---

## 3. Ruang Lingkup Tahap 2

| # | Modul | Ringkas |
|---|---|---|
| 1 | **SSO Belajar.id** | Login guru/siswa via Google Workspace for Education (OIDC). |
| 2 | **Versioning Dokumen (UI)** | Riwayat versi, bandingkan, restore. |
| 3 | **OCR & Full-Text Search Lanjutan** | Ekstraksi teks dari scan, pencarian isi dokumen. |
| 4 | **Retention Lifecycle Otomatis** | Aturan retensi → jadwal purge otomatis + notifikasi berjenjang. |
| 5 | **Backup Berlapis + Agent On-Prem** | Backup ke server lokal / external HDD sekolah. |
| 6 | **E-Ijazah** | Penerbitan, tanda tangan digital, & verifikasi ijazah. |
| 7 | **E-Raport** | Data siswa, nilai, generate raport digital. |
| 8 | **Arsip Keuangan/BOS** | Kategori khusus dana BOS dengan retensi 5 tahun. |
| 9 | **Analitik Lintas Sekolah** | Dashboard yayasan/dinas. |
| 10 | **API Publik & Integrasi** | API key, webhook, sinkronisasi Dapodik. |

---

## 4. Detail Teknis per Modul

### 4.1 SSO Belajar.id
- Alur **OIDC** (Google): `authorization_code` + verifikasi `id_token`, scope `openid email profile`.
- Pemetaan: email berdomain sekolah → auto-join tenant (opsional, berdasarkan setting).
- Role default hasil SSO = `operator` hingga diubah admin.
- Fallback: tetap sediakan login email/password untuk yang tidak punya akun Belajar.id.

### 4.2 Versioning Dokumen (UI)
- Setiap upload baru ke dokumen yang sama → `version_number` naik.
- Fitur: daftar versi, unduh versi lama, **restore** ke versi tertentu (jadi versi baru), catatan perubahan.
- Retensi mengikuti dokumen induk (versi lama ikut terhapus bila dokumen di-purge, kecuali legal hold).

### 4.3 OCR & Full-Text Search
- Pipeline worker: `upload complete` → OCR (Tesseract/cloud) → simpan `ocr_text` + `tsvector`.
- Bahasa: Indonesia + Inggris.
- Pencarian: full-text PostgreSQL dulu; opsi naik ke OpenSearch/Meilisearch jika volume besar.
- Facet: `document_type`, `academic_year`, `classroom`, `tags`, `author`.
- Batas OCR: hanya PDF/gambar, skip jika `size_bytes` > ambang (mis. 50 MB).

### 4.4 Retention Lifecycle Otomatis
- Aturan per `document_type`: `retention_months` (null = permanen), aksi akhir (`purge`/`archive`).
- **Notifikasi berjenjang**: H-30, H-7, H-1 sebelum purge → ke Kepala TU & Kepala Sekolah.
- `purge_queue` diisi otomatis oleh scheduler; tetap ada **approval manual** untuk eksekusi.
- **Legal hold** membatalkan purge otomatis (override).
- Jadwal resmi mengikuti siklus 2x/tahun (bisa dikonfigurasi).

### 4.5 Backup Berlapis + Agent On-Prem
- **Lapisan cloud:** snapshot DB harian + object versioning + cross-region copy.
- **Lapisan on-prem:** agent ringan (Go) yang dijalankan di server sekolah:
  - Register via token → `onprem_agents`.
  - Menarik arsip terpilih terjadwal → tulis ke external HDD / NAS.
  - Verifikasi checksum + laporan status ke dashboard.
- Target: **RPO 1 jam, RTO 4 jam**.

### 4.6 E-Ijazah
- Batch per tahun ajaran & kelas → generate sertifikat.
- Konten: data siswa, nomor ijazah, **QR verifikasi**, **tanda tangan digital** (X.509/PKI).
- Halaman verifikasi publik: `/verify/:serial` → valid/tidak + metadata.
- Status: `draft → issued → revoked`.
- Retensi: **permanen**.

### 4.7 E-Raport
- Data siswa + penugasan kelas + entri nilai per mapel.
- Generate raport (PDF) dengan template, tanda tangan wali kelas & Kepala Sekolah.
- Retensi: **permanen**.

### 4.8 Arsip Keuangan/BOS
- Kategori dokumen keuangan (RKAS, SPJ, kuitansi, laporan BOS).
- Retensi default **5 tahun** (mengikuti `document_types`).
- Ekspor paket audit (ZIP + manifest) untuk kebutuhan pemeriksaan.

### 4.9 Analitik Lintas Sekolah
- Agregasi lintas tenant untuk yayasan/dinas (opt-in, data anonim).
- Metrik: skor kepatuhan, pemakaian storage, dokumen mendekati retensi, tren upload.
- Implementasi awal: materialized view + cache.

### 4.10 API Publik & Integrasi
- **API key** per tenant (scoped, bisa dicabut) untuk integrasi pihak ketiga.
- **Webhook** event: `document.created`, `document.purged`, `eijazah.issued`, `backup.completed`.
- **Dapodik sync** (opsional/terbatas): impor data siswa & sekolah bila API tersedia.

---

## 5. Perubahan Skema Database (Tambahan Tahap 2)

```
-- SSO
user_identities        id, user_id, provider(google_belajar_id), subject,
                       email, created_at, UNIQUE(provider, subject)
school_sso_configs     id, school_id, provider, domain, client_id,
                       auto_join(bool), default_role, is_active

-- Backup
backup_configs         id, school_id, target(cloud|onprem), schedule_cron,
                       scope(full|documents), is_active, retention_days
backup_jobs            id, school_id, backup_config_id, status, started_at,
                       finished_at, size_bytes, checksum, error?
onprem_agents          id, school_id, name, agent_token, version,
                       last_seen_at, status

-- OCR / Search
-- tambahan kolom di document_versions:
oc  ocr_text(text), ocr_status(pending|done|failed), tsvector(ocr_text+title)
ocr_jobs               id, document_version_id, status, language,
                       started_at, finished_at, error?

-- Retention otomatis
retention_rules        id, school_id, document_type_id, retention_months,
                       action(purge|archive), notify_days_before(int[]),
                       requires_approval(bool), is_active
-- purge_queue ditambah: triggered_by(auto|manual), approved_by, approved_at

-- Siswa & Rapor
students               id, school_id, nisn?, nis?, full_name, gender,
                       birth_date?, status, created_at
student_classrooms     id, student_id, classroom_id, academic_year_id,
                       UNIQUE(student_id, classroom_id, academic_year_id)
subjects               id, school_id, name, code
grades                 id, student_id, classroom_id, subject_id,
                       term(academic_term), score, note?
report_cards           id, student_id, classroom_id, academic_year_id,
                       semester_id, status, storage_key, generated_at

-- E-Ijazah
eijazah_batches        id, school_id, academic_year_id, status, created_at
eijazah_certificates   id, batch_id, student_id, serial_number(unique),
                       content_hash, qr_payload, signature, status
                       (draft|issued|revoked), issued_at, revoked_at?

-- Keuangan/BOS
finance_archives       id, school_id, academic_year_id, category,
                       amount_idr?, document_id, created_at

-- API & Integrasi
api_keys               id, school_id, name, hashed_key, scopes(text[]),
                       last_used_at, revoked_at?, created_at
webhooks               id, school_id, url, secret, events(text[]), is_active
webhook_deliveries     id, webhook_id, event, payload(jsonb), status,
                       response_code?, attempts, created_at
dapodik_syncs          id, school_id, status, started_at, finished_at, summary(jsonb)
```

---

## 6. Tambahan Endpoint API (Tahap 2)

### SSO
| Method | Path | Deskripsi |
|---|---|---|
| GET | `/auth/sso/:provider` | Mulai alur OIDC |
| GET | `/auth/sso/:provider/callback` | Callback OIDC |
| GET/PATCH | `/schools/:id/sso` | Konfigurasi SSO sekolah |

### Versioning
| Method | Path | Deskripsi |
|---|---|---|
| GET | `/documents/:id/versions/:versionId` | Detail versi |
| POST | `/documents/:id/versions/:versionId/restore` | Restore versi |
| GET | `/documents/:id/versions/compare?from=&to=` | Bandingkan versi |

### OCR & Search
| Method | Path | Deskripsi |
|---|---|---|
| GET | `/schools/:id/search?q=&type=&year=&class=` | Search + facet |
| POST | `/documents/:id/ocr/reprocess` | Ulangi OCR |
| GET | `/documents/:id/extracted-text` | Hasil OCR |

### Retention Otomatis
| Method | Path | Deskripsi |
|---|---|---|
| GET/POST | `/schools/:id/retention/rules` | Aturan retensi |
| PATCH/DELETE | `/retention/rules/:id` | Ubah / hapus aturan |
| GET | `/schools/:id/retention/preview` | Simulasi jadwal purge |
| POST | `/purge-queue/:id/approve` | Setujui pemusnahan |
| POST | `/purge-queue/:id/reject` | Tolak pemusnahan |

### Backup & On-Prem
| Method | Path | Deskripsi |
|---|---|---|
| GET/PATCH | `/schools/:id/backups/config` | Konfigurasi backup |
| POST | `/schools/:id/backups/run` | Jalankan backup manual |
| GET | `/schools/:id/backups/jobs` | Riwayat backup |
| POST | `/onprem/agents/register` | Registrasi agent |
| POST | `/onprem/agents/:id/heartbeat` | Status agent |
| GET | `/schools/:id/onprem/agents` | Daftar agent |

### E-Ijazah
| Method | Path | Deskripsi |
|---|---|---|
| GET/POST | `/schools/:id/eijazah/batches` | Batch ijazah |
| POST | `/eijazah/batches/:id/generate` | Generate ijazah |
| POST | `/eijazah/certificates/:id/issue` | Terbitkan + tanda tangan |
| POST | `/eijazah/certificates/:id/revoke` | Cabut ijazah |
| GET | `/verify/:serial` | Verifikasi publik |
| GET | `/eijazah/certificates/:id/pdf` | Unduh ijazah |

### E-Raport
| Method | Path | Deskripsi |
|---|---|---|
| GET/POST | `/schools/:id/students` | Data siswa |
| POST | `/schools/:id/students/import` | Impor CSV |
| GET/PATCH/DELETE | `/students/:id` | Detail / edit / hapus |
| GET/POST | `/schools/:id/subjects` | Mata pelajaran |
| GET/POST | `/classrooms/:id/grades` | Nilai kelas |
| POST | `/classrooms/:id/report-cards/generate` | Generate raport |
| GET | `/report-cards/:id/pdf` | Unduh raport |

### Keuangan/BOS
| Method | Path | Deskripsi |
|---|---|---|
| GET/POST | `/schools/:id/finance/archives` | Arsip keuangan |
| GET | `/schools/:id/finance/summary` | Ringkasan per TA |
| GET | `/schools/:id/finance/export` | Paket ekspor audit (ZIP) |

### Analitik & Integrasi
| Method | Path | Deskripsi |
|---|---|---|
| GET | `/analytics/school` | Metrik sekolah |
| GET | `/analytics/network` | Metrik yayasan/dinas |
| GET/POST | `/schools/:id/api-keys` | Kelola API key |
| DELETE | `/api-keys/:id` | Cabut API key |
| GET/POST | `/schools/:id/webhooks` | Kelola webhook |
| POST | `/integrations/dapodik/sync` | Sinkronisasi Dapodik |
| GET | `/integrations/dapodik/syncs` | Riwayat sync |

---

## 7. Kepatuhan & SLO Tahap 2

| Area | Target |
|---|---|
| Ketersediaan | 99.5% uptime |
| RPO / RTO | RPO 1 jam / RTO 4 jam |
| Data residency | Tetap region Indonesia |
| Sertifikasi | Mulai proses **ISO 27001**, lengkapi **PSE Kominfo** |
| PDP | DPA dengan sekolah, audit akses berkala, hak hapus/ekspor |
| Keamanan | Penetration test tahunan, enkripsi at-rest & in-transit |

---

## 8. Roadmap & Estimasi

| Tahap | Durasi | Hasil |
|---|---|---|
| SSO Belajar.id + Versioning UI | 3–4 minggu | Login terintegrasi, riwayat dokumen |
| OCR & Search lanjutan | 3–4 minggu | Pencarian isi dokumen |
| Retention otomatis + notifikasi | 3 minggu | Lifecycle berjalan sendiri |
| Backup berlapis + agent on-prem | 4–5 minggu | RPO/RTO terpenuhi |
| E-Raport + data siswa | 4–5 minggu | Raport digital permanen |
| E-Ijazah + tanda tangan digital | 5–6 minggu | Ijazah digital terverifikasi |
| Keuangan/BOS + Analitik + API | 5–6 minggu | Paket audit, integrasi |

> Estimasi total ± 6–7 bulan dengan tim kecil (2–3 engineer + 1 desainer), berjalan paralel sebagian.

---

## 9. Risiko Tahap 2

- **Ketergantungan Belajar.id** — ketersediaan/kebijakan API Google bisa berubah → sediakan fallback login.
- **Tanda tangan digital E-Ijazah** — butuh sertifikat PKI & kepatuhan hukum; validasi dengan pihak berwenang.
- **Kompleksitas on-prem agent** — variasi perangkat sekolah → buat agent self-diagnosing & mudah dipasang.
- **Kualitas OCR** pada scan buram → beri UI koreksi & reprocess.
- **Beban biaya storage/backup** region Indonesia → hitung ulang tier harga.
- **Privasi data siswa** (UU PDP) pada modul siswa/raport/ijazah → kontrol akses ketat + enkripsi kolom sensitif.

---

## 10. Pertanyaan Terbuka

1. Prioritas modul: E-Raport dulu atau E-Ijazah dulu?
2. Penyedia sertifikat digital/PKI untuk E-Ijazah?
3. Apakah on-prem agent harus mendukung NAS selain external HDD?
4. Analitik lintas sekolah: model yayasan (satu tenant induk) atau agregasi lintas tenant?
5. Integrasi Dapodik: resmi via API atau impor manual berkala?

---

## 11. Keputusan Bawaan (dapat diubah)

| Topik | Keputusan |
|---|---|
| Siklus pilot | Lanjut dari 2–3 sekolah pilot Tahap 1 |
| Prioritas | SSO → Versioning → OCR/Search → Retention otomatis → Backup → Rapor → Ijazah → Keuangan/Analitik |
| Backup on-prem | Aktif di Tahap 2 (sebelumnya opsional) |
| Data residency | Tetap 100% region Indonesia |
