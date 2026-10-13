import { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  auth,
  json,
  registerUser,
  setupSchool,
  uploadAndComplete,
  uniqueName,
  type TestUser,
} from './helpers';

/** Unduh satu dokumen unik agar metrik dokumen/tren bertambah. */
async function uploadDocument(
  request: APIRequestContext,
  token: string,
  schoolId: string,
): Promise<string> {
  const { complete } = await uploadAndComplete(request, token, {
    schoolId,
    title: uniqueName('Dokumen Analitik'),
    fileName: `analitik-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    content: Buffer.from(`%PDF-1.4\n% ${uniqueName('analitik')}\n%%EOF\n`),
  });
  expect(complete.documentId).toBeTruthy();
  return complete.documentId as string;
}

/** Undang anggota terdaftar dengan peran tertentu dan terima undangannya. */
async function addMember(
  request: APIRequestContext,
  ownerToken: string,
  schoolId: string,
  member: TestUser,
  role: string,
): Promise<string> {
  const membership = await json(
    await request.post(`/schools/${schoolId}/members`, {
      headers: auth(ownerToken),
      data: { email: member.email, role },
    }),
    201,
  );
  await json(
    await request.post('/members/accept', {
      headers: auth(member.token),
      data: { token: membership.invitationToken },
    }),
    201,
  );
  return member.token;
}

test.describe('Analitik Lintas Sekolah', () => {
  test('metrik sekolah: bentuk data, dokumen, storage, dan tren 6 bulan', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    await uploadDocument(request, user.token, school.id);
    await uploadDocument(request, user.token, school.id);

    const res = await request.get(
      `/analytics/school?schoolId=${school.id}`,
      { headers: auth(user.token) },
    );
    const data = await json(res, 200);

    expect(data.school.id).toBe(school.id);
    expect(data.school.analyticsOptIn).toBe(false);
    expect(typeof data.compliance.score).toBe('number');
    expect(['baik', 'cukup', 'perlu_perbaikan']).toContain(
      data.compliance.status,
    );
    expect(data.documents.total).toBeGreaterThanOrEqual(2);
    expect(data.storage.quotaBytes).toBeTruthy();
    expect(data.uploads.trend.length).toBe(6);
    const months = data.uploads.trend.map((p: any) => p.month);
    const currentMonth = new Date().toISOString().slice(0, 7);
    expect(months).toContain(currentMonth);
    expect(Array.isArray(data.documentTypes)).toBe(true);
    expect(data.documentTypes.length).toBeGreaterThan(0);
  });

  test('metrik sekolah: kontrol akses dan validasi', async ({ request }) => {
    const { user, school } = await setupSchool(request);

    // Tanpa schoolId → 400.
    const missing = await request.get('/analytics/school', {
      headers: auth(user.token),
    });
    expect(missing.status()).toBe(400);

    // Non-anggota → 403.
    const outsider = await registerUser(request);
    const outsiderRes = await request.get(
      `/analytics/school?schoolId=${school.id}`,
      { headers: auth(outsider.token) },
    );
    expect(outsiderRes.status()).toBe(403);

    // Guru (anggota, tapi bukan peran pengelola) → 403.
    const teacher = await registerUser(request);
    const teacherToken = await addMember(
      request,
      user.token,
      school.id,
      teacher,
      'teacher',
    );
    const teacherRes = await request.get(
      `/analytics/school?schoolId=${school.id}`,
      { headers: auth(teacherToken) },
    );
    expect(teacherRes.status()).toBe(403);

    // Auditor → 200.
    const auditor = await registerUser(request);
    const auditorToken = await addMember(
      request,
      user.token,
      school.id,
      auditor,
      'auditor',
    );
    const auditorRes = await request.get(
      `/analytics/school?schoolId=${school.id}`,
      { headers: auth(auditorToken) },
    );
    expect(auditorRes.status()).toBe(200);
  });

  test('opt-in: dapat diubah kepala sekolah, ditolak operator/non-boolean', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    // Operator tidak boleh mengubah keputusan tata kelola data → 403.
    const operator = await registerUser(request);
    const operatorToken = await addMember(
      request,
      user.token,
      school.id,
      operator,
      'operator',
    );
    const forbidden = await request.patch(`/schools/${school.id}`, {
      headers: auth(operatorToken),
      data: { analyticsOptIn: true },
    });
    expect(forbidden.status()).toBe(403);

    // Nilai non-boolean → 400.
    const invalid = await request.patch(`/schools/${school.id}`, {
      headers: auth(user.token),
      data: { analyticsOptIn: 'ya' },
    });
    expect(invalid.status()).toBe(400);

    // Kepala sekolah boleh → 200 dan nilai tersimpan.
    const updated = await json(
      await request.patch(`/schools/${school.id}`, {
        headers: auth(user.token),
        data: { analyticsOptIn: true },
      }),
      200,
    );
    expect(updated.analyticsOptIn).toBe(true);

    const analytics = await json(
      await request.get(`/analytics/school?schoolId=${school.id}`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(analytics.school.analyticsOptIn).toBe(true);
  });

  test('metrik lintas sekolah: agregasi anonim lintas tenant', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    await uploadDocument(request, user.token, school.id);
    await json(
      await request.post(`/schools/${school.id}/compliance/snapshot`, {
        headers: auth(user.token),
      }),
      201,
    );
    await json(
      await request.patch(`/schools/${school.id}`, {
        headers: auth(user.token),
        data: { analyticsOptIn: true },
      }),
      200,
    );

    const res = await request.get('/analytics/network', {
      headers: auth(user.token),
    });
    const data = await json(res, 200);

    expect(data.scope).toBe('network');
    expect(data.schools.optedIn).toBeGreaterThanOrEqual(1);
    expect(data.compliance.schoolsWithScore).toBeGreaterThanOrEqual(1);
    expect(typeof data.compliance.averageScore).toBe('number');
    expect(data.documents.total).toBeGreaterThanOrEqual(1);
    expect(data.uploads.trend.length).toBe(6);

    const distributionTotal = data.compliance.distribution.reduce(
      (acc: number, row: any) => acc + row.count,
      0,
    );
    expect(distributionTotal).toBe(data.compliance.schoolsWithScore);

    // Anonim: tidak memuat identitas sekolah mana pun.
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(school.id);
    expect(serialized).not.toContain(school.name);
  });

  test('metrik lintas sekolah: hanya kepala sekolah/auditor (403)', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    // Guru biasa (hanya peran teacher) tidak berhak → 403.
    const teacher = await registerUser(request);
    const teacherToken = await addMember(
      request,
      user.token,
      school.id,
      teacher,
      'teacher',
    );
    const forbidden = await request.get('/analytics/network', {
      headers: auth(teacherToken),
    });
    expect(forbidden.status()).toBe(403);
  });

  test('metrik lintas sekolah: opt-out langsung mengurangi agregat', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    await json(
      await request.patch(`/schools/${school.id}`, {
        headers: auth(user.token),
        data: { analyticsOptIn: true },
      }),
      200,
    );

    const before = await json(
      await request.get('/analytics/network', { headers: auth(user.token) }),
      200,
    );

    await json(
      await request.patch(`/schools/${school.id}`, {
        headers: auth(user.token),
        data: { analyticsOptIn: false },
      }),
      200,
    );

    const after = await json(
      await request.get('/analytics/network', { headers: auth(user.token) }),
      200,
    );
    expect(after.schools.optedIn).toBe(before.schools.optedIn - 1);
  });
});
