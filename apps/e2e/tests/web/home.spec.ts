import { test, expect } from '@playwright/test';

test.describe('Web (smoke)', () => {
  test('halaman utama menampilkan judul dan fitur MVP', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Arsip Digital Sekolah' }),
    ).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Fitur MVP' })).toBeVisible();

    // Menyebutkan policy engine & retensi.
    await expect(page.getByText(/Struktur folder otomatis/)).toBeVisible();
    await expect(page.getByText(/Retensi arsip & legal hold/)).toBeVisible();

    // Ekstensi terblokir dari @arsip/shared ikut ter-render.
    await expect(page.getByText(/Ekstensi diblokir:/)).toBeVisible();
    await expect(page.getByText(/apk/)).toBeVisible();
  });
});
