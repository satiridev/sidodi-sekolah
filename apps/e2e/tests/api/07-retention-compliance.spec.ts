import { test, expect } from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import {
  auth,
  createDocument,
  json,
  registerUser,
  setupSchool,
} from './helpers';

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

async function findQueueForDocument(
  request: APIRequestContext,
  token: string,
  schoolId: string,
  documentId: string,
): Promise<any> {
  const res = await request.get(`/schools/${schoolId}/retention/queue`, {
    headers: auth(token),
  });
  const queue = await json(res, 200);
  return queue.find((q: any) => q.documentId === documentId);
}

test.describe('Retensi, Legal Hold & Kepatuhan', () => {
  test('retensi eksplisit di masa lalu tersimpan pada dokumen', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const past = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Kedaluwarsa',
      retentionExpiresAt: past,
    });
    expect(new Date(doc.retentionExpiresAt).getTime()).toBeLessThan(Date.now());
  });

  test('legal hold: wajib alasan, mencegah penjadwalan pemusnahan', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Legal Hold',
    });

    // Tanpa alasan -> 400.
    const noReason = await request.post(`/documents/${doc.id}/legal-hold`, {
      headers: auth(user.token),
      data: { isLegalHold: true },
    });
    expect(noReason.status()).toBe(400);

    // Dengan alasan -> sukses.
    const holdRes = await request.post(`/documents/${doc.id}/legal-hold`, {
      headers: auth(user.token),
      data: { isLegalHold: true, reason: 'Investigasi internal' },
    });
    const held = await json(holdRes, 201);
    expect(held.isLegalHold).toBe(true);
    expect(held.legalHoldReason).toBe('Investigasi internal');

    // Penjadwalan pemusnahan ditolak.
    const purgeRes = await request.post(`/documents/${doc.id}/schedule-purge`, {
      headers: auth(user.token),
      data: { scheduledPurgeAt: daysFromNow(30) },
    });
    expect(purgeRes.status()).toBe(400);
  });

  test('jadwalkan lalu batalkan pemusnahan dokumen', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Jadwal Purge',
    });

    const schedRes = await request.post(`/documents/${doc.id}/schedule-purge`, {
      headers: auth(user.token),
      data: { scheduledPurgeAt: daysFromNow(60), reason: 'manual' },
    });
    expect(schedRes.status()).toBe(201);

    const afterSchedule = await json(
      await request.get(`/documents/${doc.id}`, { headers: auth(user.token) }),
      200,
    );
    expect(afterSchedule.status).toBe('pending_deletion');

    const cancelRes = await request.post(`/documents/${doc.id}/cancel-purge`, {
      headers: auth(user.token),
    });
    expect(cancelRes.status()).toBe(201);
    expect((await cancelRes.json()).success).toBe(true);

    const afterCancel = await json(
      await request.get(`/documents/${doc.id}`, { headers: auth(user.token) }),
      200,
    );
    expect(afterCancel.status).toBe('active');
  });

  test('preview retensi menampilkan dokumen yang akan kedaluwarsa', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    await createDocument(request, user.token, school.id, {
      title: 'Kedaluwarsa 10 hari',
      retentionExpiresAt: daysFromNow(10),
    });

    const res = await request.get(
      `/schools/${school.id}/retention/preview?days=30`,
      { headers: auth(user.token) },
    );
    const body = await json(res, 200);
    expect(body.count).toBeGreaterThanOrEqual(1);
    expect(body.expiringInDays).toBe(30);
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('enqueue dokumen kedaluwarsa lalu approve pemusnahan', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Akan Dimusnahkan',
      retentionExpiresAt: new Date(Date.now() - 86400000).toISOString(),
    });

    const enqueueRes = await request.post(
      `/schools/${school.id}/retention/enqueue`,
      { headers: auth(user.token) },
    );
    const enqueue = await json(enqueueRes, 201);
    expect(enqueue.enqueued).toBeGreaterThanOrEqual(1);

    const queueItem = await findQueueForDocument(
      request,
      user.token,
      school.id,
      doc.id,
    );
    expect(queueItem).toBeTruthy();
    expect(queueItem.triggeredBy).toBe('auto');

    const approveRes = await request.post(`/purge-queue/${queueItem.id}/approve`, {
      headers: auth(user.token),
      data: { note: 'Disetujui E2E' },
    });
    expect(approveRes.status()).toBe(201);

    const purged = await json(
      await request.get(`/documents/${doc.id}`, { headers: auth(user.token) }),
      200,
    );
    expect(purged.purgedAt).toBeTruthy();
    expect(purged.status).toBe('deleted');
  });

  test('reject pemusnahan mengembalikan dokumen ke active', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Ditolak Dimusnahkan',
      retentionExpiresAt: new Date(Date.now() - 86400000).toISOString(),
    });

    await request.post(`/schools/${school.id}/retention/enqueue`, {
      headers: auth(user.token),
    });
    const queueItem = await findQueueForDocument(
      request,
      user.token,
      school.id,
      doc.id,
    );
    expect(queueItem).toBeTruthy();

    const rejectRes = await request.post(`/purge-queue/${queueItem.id}/reject`, {
      headers: auth(user.token),
      data: { reason: 'Masih dibutuhkan' },
    });
    expect(rejectRes.status()).toBe(201);

    const afterReject = await json(
      await request.get(`/documents/${doc.id}`, { headers: auth(user.token) }),
      200,
    );
    expect(afterReject.status).toBe('active');
    expect(afterReject.purgedAt).toBeNull();
  });

  test('skor kepatuhan: 0..100 dengan 6 pemeriksaan', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const res = await request.get(`/schools/${school.id}/compliance/score`, {
      headers: auth(user.token),
    });
    const body = await json(res, 200);
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(['baik', 'cukup', 'perlu_perbaikan']).toContain(body.status);
    expect(body.checks).toHaveLength(6);
    for (const check of body.checks) {
      expect(check).toHaveProperty('code');
      expect(check).toHaveProperty('weight');
      expect(check).toHaveProperty('pass');
      expect(typeof check.score).toBe('number');
    }
  });

  test('snapshot & riwayat kepatuhan tersimpan', async ({ request }) => {
    const { user, school } = await setupSchool(request);

    const snapRes = await request.post(
      `/schools/${school.id}/compliance/snapshot`,
      { headers: auth(user.token) },
    );
    const snapBody = await json(snapRes, 201);
    expect(Array.isArray(snapBody)).toBe(true);
    expect(snapBody.length).toBeGreaterThanOrEqual(1);

    const historyRes = await request.get(
      `/schools/${school.id}/compliance/history`,
      { headers: auth(user.token) },
    );
    const history = await json(historyRes, 200);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]).toHaveProperty('score');
  });

  test('laporan kepatuhan CSV dapat diunduh', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const res = await request.get(`/schools/${school.id}/compliance/report`, {
      headers: auth(user.token),
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    const csv = await res.text();
    expect(csv).toContain('skor_total');
    expect(csv).toContain('kebijakan_file');
  });

  test('pengaturan retensi: baca & ubah batas ukuran', async ({ request }) => {
    const { user, school } = await setupSchool(request);

    const getRes = await request.get(
      `/schools/${school.id}/retention/settings`,
      { headers: auth(user.token) },
    );
    const settings = await json(getRes, 200);
    expect(settings.purgeRequiresApproval).toBe(true);

    const patchRes = await request.patch(
      `/schools/${school.id}/retention/settings`,
      { headers: auth(user.token), data: { maxFileSizeBytes: 20_971_520 } },
    );
    const updated = await json(patchRes, 200);
    expect(updated.maxFileSizeBytes).toBe('20971520');
  });

  test('sekolah baru otomatis mendapat aturan retensi default', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const res = await request.get(`/schools/${school.id}/retention/rules`, {
      headers: auth(user.token),
    });
    const rules = await json(res, 200);

    // 12 jenis dokumen sistem dari seed.
    expect(rules.length).toBeGreaterThanOrEqual(12);
    for (const rule of rules.slice(0, 5)) {
      expect(rule.action).toBe('purge');
      expect(rule.isActive).toBe(true);
      expect(rule.documentType).toBeTruthy();
    }
  });

  test('jejak audit tingkat sekolah mencatat aktivitas & terbatas anggotanya', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const res = await request.get(`/schools/${school.id}/audit-logs`, {
      headers: auth(user.token),
    });
    const page = await json(res, 200);
    expect(Array.isArray(page.data)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.data.some((l: any) => l.entityType === 'School')).toBe(true);
    expect(page.data[0]).toHaveProperty('action');
    expect(page.data[0]).toHaveProperty('createdAt');

    // Pengguna lain (bukan anggota) ditolak.
    const outsider = await registerUser(request);
    const denied = await request.get(`/schools/${school.id}/audit-logs`, {
      headers: auth(outsider.token),
    });
    expect(denied.status()).toBe(403);
  });
});
