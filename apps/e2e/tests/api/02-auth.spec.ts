import { test, expect } from './fixtures';
import { auth, login, registerUser, uniqueEmail } from './helpers';

test.describe('Auth', () => {
  test('register membuat user + access token tanpa membocorkan passwordHash', async ({
    request,
  }) => {
    const email = uniqueEmail('register');
    const res = await request.post('/auth/register', {
      data: { email, password: 'rahasia123', name: 'Budi Santoso' },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.tokenType).toBe('Bearer');
    expect(body.user).toMatchObject({ email, name: 'Budi Santoso' });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  test('register email duplikat ditolak 409', async ({ request }) => {
    const user = await registerUser(request);

    const res = await request.post('/auth/register', {
      data: { email: user.email, password: 'rahasia123', name: 'Duplikat' },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('Conflict');
  });

  test('register password < 8 karakter ditolak 400', async ({ request }) => {
    const res = await request.post('/auth/register', {
      data: { email: uniqueEmail('pendek'), password: '123', name: 'Pendek' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('login dengan kredensial benar mengembalikan token', async ({ request }) => {
    const user = await registerUser(request);
    const token = await login(request, user.email, user.password);
    expect(token).toBeTruthy();
  });

  test('login password salah ditolak 401', async ({ request }) => {
    const user = await registerUser(request);
    const res = await request.post('/auth/login', {
      data: { email: user.email, password: 'salah-sekali' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /auth/me mengembalikan user dan memberships', async ({ request }) => {
    const user = await registerUser(request);
    const res = await request.get('/auth/me', { headers: auth(user.token) });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.user).toMatchObject({ id: user.id, email: user.email });
    expect(Array.isArray(body.memberships)).toBe(true);
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  test('GET /auth/me tanpa token ditolak 401', async ({ request }) => {
    const res = await request.get('/auth/me');
    expect(res.status()).toBe(401);
  });

  test('GET /auth/me dengan token tidak valid ditolak 401', async ({ request }) => {
    const res = await request.get('/auth/me', {
      headers: { Authorization: 'Bearer token-palsu' },
    });
    expect(res.status()).toBe(401);
  });

  test('login menetapkan cookie sesi httpOnly', async ({ request }) => {
    const user = await registerUser(request);
    const res = await request.post('/auth/login', {
      data: { email: user.email, password: user.password },
    });
    expect(res.status()).toBe(201);

    const setCookie = res.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('arsip_token=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
  });

  test('cookie sesi cukup untuk mengakses endpoint terproteksi (tanpa Bearer)', async ({
    request,
  }) => {
    const user = await registerUser(request);
    const loginRes = await request.post('/auth/login', {
      data: { email: user.email, password: user.password },
    });
    const setCookie = loginRes.headers()['set-cookie'] ?? '';
    const token = /arsip_token=([^;]+)/.exec(setCookie)?.[1];
    expect(token).toBeTruthy();

    const meRes = await request.get('/auth/me', {
      headers: { Cookie: `arsip_token=${token}` },
    });
    expect(meRes.status()).toBe(200);
    const body = await meRes.json();
    expect(body.user.email).toBe(user.email);
  });

  test('login dengan Bearer tetap didukung (kompatibilitas API)', async ({
    request,
  }) => {
    const user = await registerUser(request);
    const res = await request.post('/auth/login', {
      data: { email: user.email, password: user.password },
    });
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();

    const meRes = await request.get('/auth/me', {
      headers: auth(body.accessToken),
    });
    expect(meRes.status()).toBe(200);
  });

  test('logout menghapus cookie sesi', async ({ request }) => {
    const user = await registerUser(request);
    const loginRes = await request.post('/auth/login', {
      data: { email: user.email, password: user.password },
    });
    const cookie = /arsip_token=[^;]+/.exec(loginRes.headers()['set-cookie'] ?? '')?.[0];

    const out = await request.post('/auth/logout', {
      headers: { Cookie: cookie ?? '' },
    });
    expect(out.status()).toBe(201);
    const setCookie = out.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('arsip_token=');
    // Max-Age=0 atau kedaluwarsa di masa lalu.
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/);
  });
});
