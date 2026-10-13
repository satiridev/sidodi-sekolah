import { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  auth,
  createAcademicYear,
  createDocument,
  json,
  registerUser,
  setupSchool,
  uploadAndComplete,
  uniqueName,
} from './helpers';

/** Siapkan sekolah + tahun ajaran untuk pengujian arsip keuangan. */
async function financeSetup(request: APIRequestContext) {
  const { user, school } = await setupSchool(request);
  const year = await createAcademicYear(request, user.token, school.id);
  return { user, school, year };
}

/** Unggah satu dokumen dan kembalikan id dokumennya. */
async function uploadDocument(
  request: APIRequestContext,
  token: string,
  schoolId: string,
  fileName = 'laporan-bos.pdf',
): Promise<string> {
  const { complete } = await uploadAndComplete(request, token, {
    schoolId,
    title: uniqueName('Laporan BOS'),
    fileName,
    mimeType: 'application/pdf',
    content: Buffer.from(`%PDF-1.4\n% ${uniqueName('bos')}\n%%EOF\n`),
  });
  expect(complete.documentId).toBeTruthy();
  return complete.documentId as string;
}

test.describe('Arsip Keuangan/BOS', () => {
  test('catat arsip bertaut dokumen → ringkasan per TA → ekspor paket audit', async ({
    request,
  }) => {
    const { user, school, year } = await financeSetup(request);
    const documentId = await uploadDocument(request, user.token, school.id);

    // Arsip bertaut dokumen dengan nominal.
    const createRes = await request.post(
      `/schools/${school.id}/finance/archives`,
      {
        headers: auth(user.token),
        data: {
          category: 'LAPORAN_BOS',
          academicYearId: year.id,
          amountIdr: 1_500_000,
          documentId,
        },
      },
    );
    const archive = await json(createRes, 201);
    expect(archive.category).toBe('LAPORAN_BOS');
    expect(Number(archive.amountIdr)).toBe(1_500_000);
    expect(archive.academicYear.name).toBe(year.name);
    expect(archive.document.id).toBe(documentId);

    // Arsip tanpa dokumen (mis. nominal SPJ saja).
    await json(
      await request.post(`/schools/${school.id}/finance/archives`, {
        headers: auth(user.token),
        data: {
          category: 'SPJ',
          academicYearId: year.id,
          amountIdr: 250_000.5,
        },
      }),
      201,
    );

    // Daftar + filter kategori.
    const list = await json(
      await request.get(`/schools/${school.id}/finance/archives`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(list.length).toBe(2);

    const filtered = await json(
      await request.get(
        `/schools/${school.id}/finance/archives?category=SPJ`,
        { headers: auth(user.token) },
      ),
      200,
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].category).toBe('SPJ');

    // Ringkasan per tahun ajaran.
    const summary = await json(
      await request.get(
        `/schools/${school.id}/finance/summary?academicYearId=${year.id}`,
        { headers: auth(user.token) },
      ),
      200,
    );
    expect(summary.totalCount).toBe(2);
    expect(Number(summary.totalAmountIdr)).toBe(1_750_000.5);
    const bos = summary.byCategory.find(
      (row: any) => row.category === 'LAPORAN_BOS',
    );
    expect(bos.count).toBe(1);
    expect(Number(bos.totalAmountIdr)).toBe(1_500_000);

    // Ekspor paket audit (ZIP + manifest).
    const exportRes = await request.get(
      `/schools/${school.id}/finance/export?academicYearId=${year.id}`,
      { headers: auth(user.token) },
    );
    expect(exportRes.status()).toBe(200);
    expect(exportRes.headers()['content-type']).toContain('application/zip');
    expect(exportRes.headers()['content-disposition']).toContain('.zip');
    const bytes = await exportRes.body();
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const text = bytes.toString('latin1');
    expect(text).toContain('manifest.json');
    expect(text).toContain('laporan-bos.pdf');
  });

  test('validasi kategori dan nominal (400)', async ({ request }) => {
    const { user, school } = await financeSetup(request);

    const badCategory = await request.post(
      `/schools/${school.id}/finance/archives`,
      {
        headers: auth(user.token),
        data: { category: 'TIDAK_VALID' },
      },
    );
    expect(badCategory.status()).toBe(400);

    const badAmount = await request.post(
      `/schools/${school.id}/finance/archives`,
      {
        headers: auth(user.token),
        data: { category: 'RKAS', amountIdr: -5 },
      },
    );
    expect(badAmount.status()).toBe(400);
  });

  test('tahun ajaran/dokumen milik sekolah lain ditolak (400)', async ({
    request,
  }) => {
    const a = await financeSetup(request);
    const b = await financeSetup(request);
    const otherDocumentId = await uploadDocument(
      request,
      b.user.token,
      b.school.id,
    );

    const badYear = await request.post(
      `/schools/${a.school.id}/finance/archives`,
      {
        headers: auth(a.user.token),
        data: { category: 'RKAS', academicYearId: b.year.id },
      },
    );
    expect(badYear.status()).toBe(400);

    const badDocument = await request.post(
      `/schools/${a.school.id}/finance/archives`,
      {
        headers: auth(a.user.token),
        data: { category: 'RKAS', documentId: otherDocumentId },
      },
    );
    expect(badDocument.status()).toBe(400);
  });

  test('non-anggota 403; guru boleh melihat tapi tidak mencatat/mengekspor', async ({
    request,
  }) => {
    const { user, school } = await financeSetup(request);
    const outsider = await registerUser(request);

    const outsiderRes = await request.get(
      `/schools/${school.id}/finance/archives`,
      { headers: auth(outsider.token) },
    );
    expect(outsiderRes.status()).toBe(403);

    const teacher = await registerUser(request);
    const membership = await json(
      await request.post(`/schools/${school.id}/members`, {
        headers: auth(user.token),
        data: { email: teacher.email, role: 'teacher' },
      }),
      201,
    );
    await request.post('/members/accept', {
      headers: auth(teacher.token),
      data: { token: membership.invitationToken },
    });

    const listRes = await request.get(
      `/schools/${school.id}/finance/archives`,
      { headers: auth(teacher.token) },
    );
    expect(listRes.status()).toBe(200);

    const createRes = await request.post(
      `/schools/${school.id}/finance/archives`,
      { headers: auth(teacher.token), data: { category: 'RKAS' } },
    );
    expect(createRes.status()).toBe(403);

    const exportRes = await request.get(
      `/schools/${school.id}/finance/export`,
      { headers: auth(teacher.token) },
    );
    expect(exportRes.status()).toBe(403);
  });

  test('ekspor tanpa arsip tetap menghasilkan ZIP dengan manifest kosong', async ({
    request,
  }) => {
    const { user, school } = await financeSetup(request);

    const res = await request.get(`/schools/${school.id}/finance/export`, {
      headers: auth(user.token),
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/zip');
    const bytes = await res.body();
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.toString('latin1')).toContain('manifest.json');
  });

  test('dokumen milik sekolah ini yang sah dapat ditautkan', async ({
    request,
  }) => {
    // Memastikan createDocument + arsip tanpa berkas tetap berjalan.
    const { user, school } = await financeSetup(request);
    const document = await createDocument(request, user.token, school.id);

    const archive = await json(
      await request.post(`/schools/${school.id}/finance/archives`, {
        headers: auth(user.token),
        data: { category: 'KUITANSI', documentId: document.id },
      }),
      201,
    );
    expect(archive.document.id).toBe(document.id);
    expect(archive.amountIdr).toBeNull();
  });
});
