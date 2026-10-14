import { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  auth,
  json,
  registerUser,
  setupSchool,
  type TestUser,
} from './helpers';

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

test.describe('Backup, On-Prem, API Key, Webhook & Integrasi', () => {
  test('konfigurasi backup: auto-create, update, jalankan, riwayat', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const cfg = await json(
      await request.get(`/schools/${school.id}/backups/config`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(cfg.target).toBe('cloud');
    expect(cfg.isActive).toBe(false);

    const updated = await json(
      await request.patch(`/schools/${school.id}/backups/config`, {
        headers: auth(user.token),
        data: {
          target: 'onprem',
          scheduleCron: '0 3 * * *',
          retentionDays: 14,
          isActive: true,
        },
      }),
      200,
    );
    expect(updated.target).toBe('onprem');
    expect(updated.retentionDays).toBe(14);
    expect(updated.isActive).toBe(true);

    const run = await json(
      await request.post(`/schools/${school.id}/backups/run`, {
        headers: auth(user.token),
      }),
      202,
    );
    expect(run.status).toBe('queued');

    const jobs = await json(
      await request.get(`/schools/${school.id}/backups/jobs`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(jobs.some((j: any) => j.id === run.id)).toBe(true);
  });

  test('agent on-prem: registrasi admin, heartbeat token, token disembunyikan', async ({
    request,
    anonRequest,
  }) => {
    const { user, school } = await setupSchool(request);

    // Registrasi kini butuh admin sekolah → anonim ditolak (401).
    const anon = await anonRequest.post('/onprem/agents/register', {
      data: { schoolId: school.id, name: 'Agent Anonim' },
    });
    expect(anon.status()).toBe(401);

    const reg = await json(
      await request.post('/onprem/agents/register', {
        headers: auth(user.token),
        data: { schoolId: school.id, name: 'Agent Lab', version: '1.0.0' },
      }),
      201,
    );
    expect(reg.agentToken).toBeTruthy();
    expect(reg.status).toBe('offline');

    // Token salah → 403.
    const badToken = await request.post(
      `/onprem/agents/${reg.id}/heartbeat`,
      { data: { token: 'token-yang-salah-panjang', status: 'online' } },
    );
    expect(badToken.status()).toBe(403);

    const hb = await json(
      await request.post(`/onprem/agents/${reg.id}/heartbeat`, {
        data: { token: reg.agentToken, status: 'online' },
      }),
      200,
    );
    expect(hb.status).toBe('online');
    expect(hb.lastSeenAt).toBeTruthy();

    const list = await json(
      await request.get(`/schools/${school.id}/onprem/agents`, {
        headers: auth(user.token),
      }),
      200,
    );
    const found = list.find((a: any) => a.id === reg.id);
    expect(found).toBeTruthy();
    expect(found.agentToken).toBeUndefined();
  });

  test('API key: buat (kunci sekali), daftar tanpa hash, cabut, validasi', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const created = await json(
      await request.post(`/schools/${school.id}/api-keys`, {
        headers: auth(user.token),
        data: { name: 'Integrasi Dapodik', scopes: ['documents:read'] },
      }),
      201,
    );
    expect(created.key).toMatch(/^ak_[0-9a-f]{48}$/);

    const list = await json(
      await request.get(`/schools/${school.id}/api-keys`, {
        headers: auth(user.token),
      }),
      200,
    );
    const item = list.find((k: any) => k.id === created.id);
    expect(item).toBeTruthy();
    expect(item.hashedKey).toBeUndefined();
    expect(item.key).toBeUndefined();

    const invalid = await request.post(`/schools/${school.id}/api-keys`, {
      headers: auth(user.token),
      data: { name: 'x' },
    });
    expect(invalid.status()).toBe(400);

    await json(
      await request.delete(`/api-keys/${created.id}`, {
        headers: auth(user.token),
      }),
      200,
    );
    const after = await json(
      await request.get(`/schools/${school.id}/api-keys`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(after.find((k: any) => k.id === created.id).revokedAt).toBeTruthy();
  });

  test('Webhook: buat dengan secret, daftar tanpa secret, validasi & hapus', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const created = await json(
      await request.post(`/schools/${school.id}/webhooks`, {
        headers: auth(user.token),
        data: {
          url: 'https://contoh.test/hooks/arsip',
          events: ['document.created', 'eijazah.issued'],
        },
      }),
      201,
    );
    expect(created.secret).toBeTruthy();
    expect(created.events).toContain('document.created');

    const list = await json(
      await request.get(`/schools/${school.id}/webhooks`, {
        headers: auth(user.token),
      }),
      200,
    );
    const item = list.find((w: any) => w.id === created.id);
    expect(item).toBeTruthy();
    expect(item.secret).toBeUndefined();

    const badUrl = await request.post(`/schools/${school.id}/webhooks`, {
      headers: auth(user.token),
      data: { url: 'bukan-url', events: ['x'] },
    });
    expect(badUrl.status()).toBe(400);

    await json(
      await request.delete(`/webhooks/${created.id}`, {
        headers: auth(user.token),
      }),
      200,
    );
    const after = await json(
      await request.get(`/schools/${school.id}/webhooks`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(after.find((w: any) => w.id === created.id)).toBeFalsy();
  });

  test('Dapodik: antre sinkronisasi, riwayat, dan validasi schoolId', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const sync = await json(
      await request.post('/integrations/dapodik/sync', {
        headers: auth(user.token),
        data: { schoolId: school.id },
      }),
      202,
    );
    expect(sync.status).toBe('queued');

    const list = await json(
      await request.get(`/integrations/dapodik/syncs?schoolId=${school.id}`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(list.some((s: any) => s.id === sync.id)).toBe(true);

    const missing = await request.get('/integrations/dapodik/syncs', {
      headers: auth(user.token),
    });
    expect(missing.status()).toBe(400);
  });

  test('SSO Belajar.id: default, update admin, ditolak operator & nilai invalid', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const cfg = await json(
      await request.get(`/schools/${school.id}/sso`, {
        headers: auth(user.token),
      }),
      200,
    );
    expect(cfg.provider).toBe('google_belajar_id');
    expect(cfg.autoJoin).toBe(false);
    expect(cfg.defaultRole).toBe('operator');

    const operator = await registerUser(request);
    const opToken = await addMember(
      request,
      user.token,
      school.id,
      operator,
      'operator',
    );
    const forbidden = await request.patch(`/schools/${school.id}/sso`, {
      headers: auth(opToken),
      data: { autoJoin: true },
    });
    expect(forbidden.status()).toBe(403);

    const invalidRole = await request.patch(`/schools/${school.id}/sso`, {
      headers: auth(user.token),
      data: { defaultRole: 'superadmin' },
    });
    expect(invalidRole.status()).toBe(400);

    const updated = await json(
      await request.patch(`/schools/${school.id}/sso`, {
        headers: auth(user.token),
        data: {
          domain: 'sekolah.sch.id',
          clientId: '1234567890-abc.apps.googleusercontent.com',
          autoJoin: true,
          defaultRole: 'teacher',
          isActive: true,
        },
      }),
      200,
    );
    expect(updated.domain).toBe('sekolah.sch.id');
    expect(updated.autoJoin).toBe(true);
    expect(updated.defaultRole).toBe('teacher');
    expect(updated.isActive).toBe(true);
  });
});
