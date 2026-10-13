import { test, expect } from './fixtures';
import type { APIRequestContext } from '@playwright/test';
import type { TestUser } from './helpers';
import {
  auth,
  createDocument,
  json,
  registerUser,
  setupSchool,
} from './helpers';

async function inviteAndAccept(
  request: APIRequestContext,
  headToken: string,
  schoolId: string,
  invitee: TestUser,
  role: string,
): Promise<{ membershipId: string; accepted: any }> {
  const inviteRes = await request.post(`/schools/${schoolId}/members`, {
    headers: auth(headToken),
    data: { email: invitee.email, role },
  });
  const membership = await json(inviteRes, 201);
  expect(membership.status).toBe('invited');
  expect(membership.invitationToken).toBeTruthy();

  const acceptRes = await request.post('/members/accept', {
    headers: auth(invitee.token),
    data: { token: membership.invitationToken },
  });
  const accepted = await json(acceptRes, 201);
  expect(accepted.status).toBe('active');
  return { membershipId: membership.id, accepted };
}

test.describe('RBAC & Anggota', () => {
  test('undang anggota lalu terima undangan (active)', async ({ request }) => {
    const { user: head, school } = await setupSchool(request);
    const teacher = await registerUser(request, { name: 'Guru Uji' });

    const { accepted } = await inviteAndAccept(
      request,
      head.token,
      school.id,
      teacher,
      'teacher',
    );
    expect(accepted.role).toBe('teacher');

    // Terlihat di daftar anggota.
    const listRes = await request.get(`/schools/${school.id}/members`, {
      headers: auth(head.token),
    });
    const list = await json(listRes, 200);
    expect(list.items.some((m: any) => m.user.email === teacher.email)).toBe(true);

    // Guru melihat sekolahnya di /auth/me.
    const me = await json(
      await request.get('/auth/me', { headers: auth(teacher.token) }),
      200,
    );
    expect(me.memberships.some((m: any) => m.schoolId === school.id)).toBe(true);
  });

  test('accept undangan dengan token salah ditolak 400', async ({ request }) => {
    const teacher = await registerUser(request);
    const res = await request.post('/members/accept', {
      headers: auth(teacher.token),
      data: { token: 'token-palsu' },
    });
    expect(res.status()).toBe(400);
  });

  test('guru: boleh buat dokumen, tidak boleh ubah pengaturan sekolah', async ({
    request,
  }) => {
    const { user: head, school } = await setupSchool(request);
    const teacher = await registerUser(request);
    await inviteAndAccept(request, head.token, school.id, teacher, 'teacher');

    // Boleh membuat dokumen.
    const doc = await createDocument(request, teacher.token, school.id, {
      title: 'Dokumen Guru',
    });
    expect(doc.id).toBeTruthy();

    // Tidak boleh ubah settings sekolah.
    const res = await request.patch(`/schools/${school.id}/settings`, {
      headers: auth(teacher.token),
      data: { maxFileSizeBytes: 10_485_760 },
    });
    expect(res.status()).toBe(403);
  });

  test('guru: tidak boleh hapus folder / undang anggota', async ({ request }) => {
    const { user: head, school } = await setupSchool(request);
    const teacher = await registerUser(request);
    await inviteAndAccept(request, head.token, school.id, teacher, 'teacher');

    const folderRes = await request.post('/folders', {
      headers: auth(head.token),
      data: { schoolId: school.id, name: 'Folder RBAC' },
    });
    const folder = await json(folderRes, 201);

    const delRes = await request.delete(`/folders/${folder.id}`, {
      headers: auth(teacher.token),
    });
    expect(delRes.status()).toBe(403);

    const inviteRes = await request.post(`/schools/${school.id}/members`, {
      headers: auth(teacher.token),
      data: { email: 'orang.baru@sekolah.test', role: 'teacher' },
    });
    expect(inviteRes.status()).toBe(403);
  });

  test('operator: boleh ubah data sekolah, tidak boleh ubah settings', async ({
    request,
  }) => {
    const { user: head, school } = await setupSchool(request);
    const operator = await registerUser(request);
    await inviteAndAccept(request, head.token, school.id, operator, 'operator');

    const updateRes = await request.patch(`/schools/${school.id}`, {
      headers: auth(operator.token),
      data: { city: 'Surabaya' },
    });
    expect(updateRes.status()).toBe(200);
    expect((await updateRes.json()).city).toBe('Surabaya');

    const settingsRes = await request.patch(`/schools/${school.id}/settings`, {
      headers: auth(operator.token),
      data: { maxFileSizeBytes: 10_485_760 },
    });
    expect(settingsRes.status()).toBe(403);
  });

  test('auditor: boleh lihat skor kepatuhan, tidak boleh ubah sekolah', async ({
    request,
  }) => {
    const { user: head, school } = await setupSchool(request);
    const auditor = await registerUser(request);
    await inviteAndAccept(request, head.token, school.id, auditor, 'auditor');

    const scoreRes = await request.get(
      `/schools/${school.id}/compliance/score`,
      { headers: auth(auditor.token) },
    );
    expect(scoreRes.status()).toBe(200);

    const updateRes = await request.patch(`/schools/${school.id}`, {
      headers: auth(auditor.token),
      data: { city: 'Medan' },
    });
    expect(updateRes.status()).toBe(403);
  });

  test('anggota yang disuspend kehilangan akses (403)', async ({ request }) => {
    const { user: head, school } = await setupSchool(request);
    const teacher = await registerUser(request);
    const { membershipId } = await inviteAndAccept(
      request,
      head.token,
      school.id,
      teacher,
      'teacher',
    );

    const suspendRes = await request.patch(`/members/${membershipId}`, {
      headers: auth(head.token),
      data: { status: 'suspended' },
    });
    expect(suspendRes.status()).toBe(200);

    const accessRes = await request.get(`/schools/${school.id}`, {
      headers: auth(teacher.token),
    });
    expect(accessRes.status()).toBe(403);
  });

  test('non-anggota tidak bisa lihat daftar anggota (403)', async ({ request }) => {
    const { school } = await setupSchool(request);
    const outsider = await registerUser(request);
    const res = await request.get(`/schools/${school.id}/members`, {
      headers: auth(outsider.token),
    });
    expect(res.status()).toBe(403);
  });

  test('headmaster tidak dapat dihapus / disuspend', async ({ request }) => {
    const { user: head, school } = await setupSchool(request);

    const members = await json(
      await request.get(`/schools/${school.id}/members`, {
        headers: auth(head.token),
      }),
      200,
    );
    const own = members.items.find((m: any) => m.user.email === head.email);
    expect(own).toBeTruthy();

    const delRes = await request.delete(`/members/${own.id}`, {
      headers: auth(head.token),
    });
    expect(delRes.status()).toBe(403);
  });
});
