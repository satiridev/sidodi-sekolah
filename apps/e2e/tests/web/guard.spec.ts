import { test, expect } from '@playwright/test';

test.describe('Proteksi rute (middleware)', () => {
  test('tanpa sesi, /dashboard dialihkan ke /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('auth-submit')).toBeVisible();
  });

  test('tanpa sesi, /schools/:id dialihkan ke /login', async ({ page }) => {
    await page.goto('/schools/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('auth-submit')).toBeVisible();
  });

  test('tanpa sesi, /schools/:id/students dialihkan ke /login', async ({
    page,
  }) => {
    await page.goto('/schools/00000000-0000-0000-0000-000000000000/students');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('auth-submit')).toBeVisible();
  });

  test('tanpa sesi, /analytics dialihkan ke /login', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('auth-submit')).toBeVisible();
  });
});
