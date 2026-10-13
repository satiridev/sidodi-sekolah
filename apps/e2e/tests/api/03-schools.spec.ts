import { test, expect } from './fixtures';
import {
  auth,
  createSchool,
  registerUser,
  setupSchool,
  uniqueName,
} from './helpers';

test.describe('Schools', () => {
  test('POST /schools membuat sekolah + membership headmaster + slug', async ({
    request,
  }) => {
    const user = await registerUser(request);
    const school = await createSchool(request, user.token, {
      name: 'SMA Contoh E2E',
      city: 'Bekasi',
      province: 'Jawa Barat',
    });

    expect(school.id).toBeTruthy();
    expect(school.slug).toBeTruthy();
    expect(school.planCode).toBe('trial');
    expect(school.status).toBe('active');
    // BigInt diserialisasi sebagai string.
    expect(typeof school.storageQuotaBytes).toBe('string');

    // Membership otomatis terbentuk -> /auth/me menampilkan sekolah.
    const meRes = await request.get('/auth/me', { headers: auth(user.token) });
    const me = await meRes.json();
    expect(me.memberships.map((m: any) => m.schoolId)).toContain(school.id);
    expect(me.memberships[0].role).toBe('headmaster');
  });

  test('POST /schools tanpa token ditolak 401', async ({ request }) => {
    const res = await request.post('/schools', {
      data: { name: 'Sekolah Tanpa Token' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /schools slug duplikat (eksplisit) ditolak 409', async ({ request }) => {
    const user = await registerUser(request);
    const slug = `sekolah-dup-${Date.now()}`;
    await createSchool(request, user.token, { slug });

    const res = await request.post('/schools', {
      headers: auth(user.token),
      data: { name: 'Sekolah Duplikat', slug },
    });
    expect(res.status()).toBe(409);
  });

  test('GET /schools/slug/:slug dapat diakses publik', async ({ request }) => {
    const { school } = await setupSchool(request);
    const res = await request.get(`/schools/slug/${school.slug}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(school.id);
    expect(body.name).toBe(school.name);
  });

  test('GET /schools/:id oleh anggota mengembalikan detail + _count', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const res = await request.get(`/schools/${school.id}`, {
      headers: auth(user.token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(school.id);
    expect(body._count).toMatchObject({
      memberships: expect.any(Number),
      folders: expect.any(Number),
    });
  });

  test('GET /schools/:id tanpa token ditolak 401', async ({
    request,
    anonRequest,
  }) => {
    const { school } = await setupSchool(request);
    const res = await anonRequest.get(`/schools/${school.id}`);
    expect(res.status()).toBe(401);
  });

  test('GET /schools/:id oleh non-anggota ditolak 403', async ({ request }) => {
    const { school } = await setupSchool(request);
    const outsider = await registerUser(request);

    const res = await request.get(`/schools/${school.id}`, {
      headers: auth(outsider.token),
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('Forbidden');
  });

  test('PATCH /schools/:id mengubah data sekolah (headmaster)', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const res = await request.patch(`/schools/${school.id}`, {
      headers: auth(user.token),
      data: { name: uniqueName('Sekolah Berubah'), city: 'Bandung' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.city).toBe('Bandung');
    expect(body.name).toContain('Sekolah Berubah');
  });

  test('PATCH /schools/:id/settings mengubah batas & kuota (BigInt -> string)', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const res = await request.patch(`/schools/${school.id}/settings`, {
      headers: auth(user.token),
      data: { maxFileSizeBytes: 10_485_760, quotaBytes: 2_147_483_648 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.maxFileSizeBytes).toBe('10485760');
    expect(body.storageQuotaBytes).toBe('2147483648');
  });

  test('GET /schools/:id/storage mengembalikan kuota, terpakai, sisa', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const res = await request.get(`/schools/${school.id}/storage`, {
      headers: auth(user.token),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.quotaBytes).toBe('string');
    expect(typeof body.usedBytes).toBe('string');
    expect(typeof body.remainingBytes).toBe('string');
    expect(typeof body.usagePercent).toBe('number');
    expect(body.maxFileSizeBytes).toBeTruthy();
  });
});
