import { test, expect } from './fixtures';

test.describe('Health', () => {
  test('GET /health mengembalikan status ok dan database up', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(typeof body.uptime).toBe('number');
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});
