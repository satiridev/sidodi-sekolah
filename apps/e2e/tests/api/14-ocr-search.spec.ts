import { test, expect } from './fixtures';
import {
  auth,
  json,
  registerUser,
  setupSchool,
  uniqueName,
  uploadAndComplete,
} from './helpers';

test.describe('OCR & Pencarian Full-Text', () => {
  test('ekstraksi berkas teks → pencarian menemukannya + facet', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const keyword = uniqueName('anggaranpendidikan').replace(/[^a-z0-9]/gi, '');
    const content = `Laporan keuangan ${keyword} tahun anggaran berjalan.`;

    const { complete } = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      title: uniqueName('Laporan OCR'),
      fileName: `laporan-${Date.now()}.txt`,
      mimeType: 'text/plain',
      content: Buffer.from(content, 'utf8'),
    });
    const docId = complete.documentId as string;
    expect(docId).toBeTruthy();

    // Unggahan membuat pekerjaan OCR tertunda.
    const pending = await json(
      await request.get(`/documents/${docId}/ocr/status`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(pending.length).toBeGreaterThanOrEqual(1);

    const run = await json(
      await request.post(`/schools/${school.id}/ocr/run`, {
        headers: auth(user.token),
      }),
      201,
    );
    expect(run.processed).toBeGreaterThanOrEqual(1);

    const extracted = await json(
      await request.get(`/documents/${docId}/extracted-text`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(extracted.status).toBe('done');
    expect(extracted.text).toContain(keyword);

    const status = await json(
      await request.get(`/documents/${docId}/ocr/status`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(status[0].status).toBe('done');

    const search = await json(
      await request.get(
        `/schools/${school.id}/search?q=${encodeURIComponent(keyword)}`,
        { headers: auth(user.token) },
      ),
      200,
    );
    expect(search.total).toBeGreaterThanOrEqual(1);
    expect(search.data.some((d: any) => d.id === docId)).toBe(true);
    expect(search.data[0]).toHaveProperty('excerpt');
    expect(search.page).toBe(1);
    expect(search.limit).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(search.facets.documentType)).toBe(true);
    expect(Array.isArray(search.facets.academicYear)).toBe(true);
    expect(Array.isArray(search.facets.tags)).toBe(true);
  });

  test('reprocess OCR menjalankan ulang & mengembalikan panjang teks', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const keyword = uniqueName('rapatkomite').replace(/[^a-z0-9]/gi, '');

    const { complete } = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      title: uniqueName('Notulen OCR'),
      fileName: `notulen-${Date.now()}.txt`,
      mimeType: 'text/plain',
      content: Buffer.from(`Notulen rapat komite ${keyword}.`, 'utf8'),
    });
    const docId = complete.documentId as string;

    const result = await json(
      await request.post(`/documents/${docId}/ocr/reprocess`, {
        headers: auth(user.token),
      }),
      201,
    );
    expect(result.status).toBe('done');
    expect(result.textLength).toBeGreaterThan(0);
  });

  test('gambar ditandai skipped (butuh penyedia OCR eksternal)', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    // Header PNG minimal; ekstraksi teks tidak didukung untuk gambar.
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const { complete } = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      title: uniqueName('Pindai Gambar'),
      fileName: `pindai-${Date.now()}.png`,
      mimeType: 'image/png',
      content: png,
    });
    const docId = complete.documentId as string;

    await json(
      await request.post(`/schools/${school.id}/ocr/run`, {
        headers: auth(user.token),
      }),
      201,
    );

    const extracted = await json(
      await request.get(`/documents/${docId}/extracted-text`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(extracted.status).toBe('skipped');
    expect(extracted.text).toBe('');
  });

  test('pencarian: parameter q wajib dan dibatasi anggota', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const missing = await request.get(`/schools/${school.id}/search`, {
      headers: auth(user.token),
    });
    expect(missing.status()).toBe(400);

    const outsider = await registerUser(request);
    const denied = await request.get(
      `/schools/${school.id}/search?q=laporan`,
      { headers: auth(outsider.token) },
    );
    expect(denied.status()).toBe(403);
  });
});
