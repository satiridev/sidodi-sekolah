import { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  auth,
  createDocument,
  json,
  registerUser,
  setupSchool,
  uniqueName,
  type TestUser,
} from './helpers';

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
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

test.describe('Retensi Otomatis & Notifikasi Berjenjang', () => {
  test('enqueue-all mengantre dokumen kedaluwarsa + notifikasi H-1', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: uniqueName('Dokumen Retensi'),
      retentionExpiresAt: daysAgo(3),
    });

    const res = await request.post(
      `/schools/${school.id}/retention/enqueue-all`,
      { headers: auth(user.token) },
    );
    const body = await json(res, 201);
    expect(body.scanned).toBeGreaterThanOrEqual(1);
    expect(body.enqueued).toBeGreaterThanOrEqual(1);

    const queue = await json(
      await request.get(`/schools/${school.id}/retention/queue`, {
        headers: auth(user.token),
      }),
      200,
    );
    const item = queue.find((q: any) => q.documentId === doc.id);
    expect(item).toBeTruthy();
    expect(item.triggeredBy).toBe('auto');
    expect(item.reason).toBe('retention_expired');

    const after = await json(
      await request.get(`/documents/${doc.id}`, { headers: auth(user.token) }),
      200,
    );
    expect(after.status).toBe('pending_deletion');

    const notifications = await json(
      await request.get(`/schools/${school.id}/retention/notifications`, {
        headers: auth(user.token),
      }),
      200,
    );
    const notif = notifications.find((n: any) => n.documentId === doc.id);
    expect(notif).toBeTruthy();
    expect(notif.stage).toBe(1);
    expect(notif.status).toBe('sent');
    expect(notif.recipientRoles).toContain('headmaster');
    expect(notif.recipientCount).toBeGreaterThanOrEqual(1);
  });

  test('enqueue-all idempoten: pemanggilan kedua tidak menduplikasi antrean', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    await createDocument(request, user.token, school.id, {
      title: uniqueName('Dokumen Idempoten'),
      retentionExpiresAt: daysAgo(2),
    });

    const first = await json(
      await request.post(`/schools/${school.id}/retention/enqueue-all`, {
        headers: auth(user.token),
      }),
      201,
    );
    expect(first.enqueued).toBeGreaterThanOrEqual(1);

    const second = await json(
      await request.post(`/schools/${school.id}/retention/enqueue-all`, {
        headers: auth(user.token),
      }),
      201,
    );
    expect(second.enqueued).toBe(0);
  });

  test('scheduler menjalankan pengantrean otomatis lintas sekolah', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: uniqueName('Dokumen Scheduler'),
      retentionExpiresAt: daysAgo(1),
    });

    const res = await request.post('/retention/scheduler/run', {
      headers: auth(user.token),
    });
    const body = await json(res, 201);
    expect(body.schools).toBeGreaterThanOrEqual(1);
    expect(body.totalEnqueued).toBeGreaterThanOrEqual(1);
    expect(body.ranAt).toBeTruthy();

    const after = await json(
      await request.get(`/documents/${doc.id}`, { headers: auth(user.token) }),
      200,
    );
    expect(after.status).toBe('pending_deletion');
  });

  test('retentionAutoEnqueue dapat dinonaktifkan admin & tercermin di settings', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const settings = await json(
      await request.get(`/schools/${school.id}/retention/settings`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(settings.autoEnqueueExpired).toBe(true);

    // Operator tidak boleh mengubah keputusan tata kelola data → 403.
    const operator = await registerUser(request);
    const opToken = await addMember(
      request,
      user.token,
      school.id,
      operator,
      'operator',
    );
    const forbidden = await request.patch(`/schools/${school.id}`, {
      headers: auth(opToken),
      data: { retentionAutoEnqueue: false },
    });
    expect(forbidden.status()).toBe(403);

    const patched = await json(
      await request.patch(`/schools/${school.id}`, {
        headers: auth(user.token),
        data: { retentionAutoEnqueue: false },
      }),
      200,
    );
    expect(patched.retentionAutoEnqueue).toBe(false);

    const after = await json(
      await request.get(`/schools/${school.id}/retention/settings`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(after.autoEnqueueExpired).toBe(false);
  });

  test('antrean & notifikasi dibatasi peran pengelola/auditor', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const teacher = await registerUser(request);
    const teacherToken = await addMember(
      request,
      user.token,
      school.id,
      teacher,
      'teacher',
    );
    const denied = await request.get(
      `/schools/${school.id}/retention/notifications`,
      { headers: auth(teacherToken) },
    );
    expect(denied.status()).toBe(403);

    const auditor = await registerUser(request);
    const auditorToken = await addMember(
      request,
      user.token,
      school.id,
      auditor,
      'auditor',
    );
    const allowed = await request.get(
      `/schools/${school.id}/retention/notifications`,
      { headers: auth(auditorToken) },
    );
    expect(allowed.status()).toBe(200);

    const operator = await registerUser(request);
    const opToken = await addMember(
      request,
      user.token,
      school.id,
      operator,
      'operator',
    );
    const forbidden = await request.post(
      `/schools/${school.id}/retention/enqueue-all`,
      { headers: auth(opToken) },
    );
    expect(forbidden.status()).toBe(403);
  });
});
