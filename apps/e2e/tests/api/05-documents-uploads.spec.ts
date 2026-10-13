import { test, expect } from './fixtures';
import {
  auth,
  createDocument,
  createDocumentType,
  downloadDocument,
  json,
  registerUser,
  setupSchool,
  uploadAndComplete,
} from './helpers';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';

test.describe('Dokumen & Upload', () => {
  test('create dokumen mewarisi retensi dari jenis dokumen (financial_5y)', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const docType = await createDocumentType(request, user.token, school.id, {
      name: 'Keuangan Uji',
      code: `KEU${Date.now()}`,
      retentionType: 'financial_5y',
    });

    const doc = await createDocument(request, user.token, school.id, {
      documentTypeId: docType.id,
      title: 'Laporan Keuangan Uji',
    });

    expect(doc.retentionType).toBe('financial_5y');
    expect(doc.retentionExpiresAt).toBeTruthy();
    const years =
      (new Date(doc.retentionExpiresAt).getTime() - Date.now()) /
      (365 * 24 * 3600 * 1000);
    expect(years).toBeGreaterThan(4.9);
    expect(years).toBeLessThan(5.1);
  });

  test('jenis dokumen academic_permanent menyimpan tanpa tanggal kedaluwarsa', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const docType = await createDocumentType(request, user.token, school.id, {
      name: 'Ijazah Uji',
      code: `IJZ${Date.now()}`,
      retentionType: 'academic_permanent',
    });

    const doc = await createDocument(request, user.token, school.id, {
      documentTypeId: docType.id,
      title: 'Ijazah Permanen',
    });
    expect(doc.retentionType).toBe('academic_permanent');
    expect(doc.retentionExpiresAt).toBeNull();
  });

  test('alur upload penuh: initiate -> content -> complete -> versi -> download', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Untuk Diunggah',
    });

    const content = Buffer.from('Isi dokumen uji end-to-end, ' + Date.now());
    const { complete } = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'surat-uji.pdf',
      mimeType: 'application/pdf',
      content,
    });

    expect(complete.deduplicated).toBe(false);
    expect(complete.documentId).toBe(doc.id);
    expect(complete.versionNumber).toBe(1);
    expect(complete.contentHash).toBeTruthy();

    // Dokumen kini punya currentVersion.
    const getRes = await request.get(`/documents/${doc.id}`, {
      headers: auth(user.token),
    });
    const full = await json(getRes, 200);
    expect(full.currentVersion.id).toBe(complete.versionId);
    expect(full.versions).toHaveLength(1);

    // Download mengembalikan byte yang sama.
    const { fileName, body } = await downloadDocument(
      request,
      user.token,
      doc.id,
      API_ORIGIN,
    );
    expect(fileName).toBe('surat-uji.pdf');
    expect(body.equals(content)).toBe(true);

    // Metadata file di storage dihitung ke kuota sekolah.
    const storageRes = await request.get(`/schools/${school.id}/storage`, {
      headers: auth(user.token),
    });
    const storage = await storageRes.json();
    expect(Number(storage.usedBytes)).toBeGreaterThanOrEqual(content.length);
  });

  test('deduplication: byte identik tidak dibuat ulang', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const doc1 = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Dedup 1',
    });
    const doc2 = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Dedup 2',
    });

    const content = Buffer.from('Byte identik untuk uji dedup ' + Date.now());

    const first = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc1.id,
      fileName: 'dup.pdf',
      mimeType: 'application/pdf',
      content,
    });
    expect(first.complete.deduplicated).toBe(false);

    const second = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc2.id,
      fileName: 'dup.pdf',
      mimeType: 'application/pdf',
      content,
    });
    expect(second.complete.deduplicated).toBe(true);
    expect(second.complete.documentId).toBe(doc1.id);
    // Respons dedup menunjuk ke versi yang sudah ada.
    expect(second.complete.existingVersionId).toBe(first.complete.versionId);

    // Cek duplikat by hash.
    const checkRes = await request.post('/documents/check-duplicate', {
      headers: auth(user.token),
      data: { schoolId: school.id, contentHash: first.complete.contentHash },
    });
    const check = await json(checkRes, 201);
    expect(check.isDuplicate).toBe(true);
    expect(check.existingDocument.id).toBe(doc1.id);
  });

  test('upload tanpa documentId membuat dokumen baru dari jenis dokumen', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const docType = await createDocumentType(request, user.token, school.id, {
      name: 'Rapor Uji',
      code: `RPR${Date.now()}`,
      retentionType: 'custom',
      retentionMonths: 12,
    });

    const content = Buffer.from('Data rapor baru ' + Date.now());
    const { complete } = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentTypeId: docType.id,
      fileName: 'rapor-budi.pdf',
      mimeType: 'application/pdf',
      content,
    });

    expect(complete.deduplicated).toBe(false);
    const getRes = await request.get(`/documents/${complete.documentId}`, {
      headers: auth(user.token),
    });
    const doc = await json(getRes, 200);
    expect(doc.documentTypeId).toBe(docType.id);
    expect(doc.retentionExpiresAt).toBeTruthy();
    // Judul default diambil dari nama file (tanpa ekstensi).
    expect(doc.title).toBe('rapor-budi');
  });

  test('policy: ekstensi terlarang ditolak pada validate & initiate', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const valRes = await request.post('/policy/validate', {
      headers: auth(user.token),
      data: { schoolId: school.id, fileName: 'virus.apk', sizeBytes: '1024' },
    });
    const val = await json(valRes, 201);
    expect(val.allowed).toBe(false);
    expect(val.reasons.join(' ')).toContain('apk');

    const initRes = await request.post('/uploads/initiate', {
      headers: auth(user.token),
      data: {
        schoolId: school.id,
        fileName: 'virus.apk',
        mimeType: 'application/vnd.android.package-archive',
        sizeBytes: 1024,
      },
    });
    expect(initRes.status()).toBe(400);
    const initBody = await initRes.json();
    expect(initBody.error.code).toBe('POLICY_VIOLATION');
  });

  test('policy: ekstensi di luar allowlist jenis dokumen ditolak', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const docType = await createDocumentType(request, user.token, school.id, {
      name: 'Hanya PDF',
      code: `PDF${Date.now()}`,
      retentionType: 'custom',
      allowedExtensions: ['pdf'],
    });

    const initRes = await request.post('/uploads/initiate', {
      headers: auth(user.token),
      data: {
        schoolId: school.id,
        documentTypeId: docType.id,
        fileName: 'gambar.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
      },
    });
    expect(initRes.status()).toBe(400);
    const body = await initRes.json();
    expect(body.error.code).toBe('POLICY_VIOLATION');
    expect(body.error.message).toContain('tidak diizinkan');
  });

  test('soft delete & restore dokumen', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Akan Dihapus',
    });

    const delRes = await request.delete(`/documents/${doc.id}`, {
      headers: auth(user.token),
    });
    expect(delRes.status()).toBe(200);

    const getDeleted = await request.get(`/documents/${doc.id}`, {
      headers: auth(user.token),
    });
    expect(getDeleted.status()).toBe(404);

    const restoreRes = await request.post(`/documents/${doc.id}/restore`, {
      headers: auth(user.token),
    });
    expect(restoreRes.status()).toBe(201);
    expect((await restoreRes.json()).status).toBe('active');
  });

  test('non-anggota tidak dapat download dokumen (403)', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Rahasia Sekolah',
    });
    await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'rahasia.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('rahasia ' + Date.now()),
    });

    const outsider = await registerUser(request);
    const res = await request.get(`/documents/${doc.id}/download`, {
      headers: auth(outsider.token),
    });
    expect(res.status()).toBe(403);
  });

  test('list dokumen dengan filter pencarian (q)', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const marker = `UNIK-${Date.now()}`;
    await createDocument(request, user.token, school.id, {
      title: `Surat ${marker}`,
    });

    const res = await request.get(
      `/schools/${school.id}/documents?q=${encodeURIComponent(marker)}`,
      { headers: auth(user.token) },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items.some((d: any) => d.title.includes(marker))).toBe(true);
  });
});
