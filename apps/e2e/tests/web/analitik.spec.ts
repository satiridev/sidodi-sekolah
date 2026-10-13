import { test, expect, Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@sekolah.test`;
}

/** Registrasi lewat UI lalu buat sekolah, berakhir di halaman sekolah. */
async function signUpAndCreateSchool(
  page: Page,
  schoolName: string,
): Promise<{ email: string; schoolId: string }> {
  const email = uniqueEmail('analitik.ui');

  await page.goto('/login');
  await expect(page.getByTestId('auth-submit')).toBeVisible();

  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Kepala Sekolah Analitik');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill('rahasia123');
  await page.getByTestId('auth-submit').click();

  await expect(page.getByTestId('dashboard')).toBeVisible();

  await page.getByTestId('new-school-name').fill(schoolName);
  await page.getByTestId('new-school-city').fill('Yogyakarta');
  await page.getByTestId('create-school-submit').click();

  const card = page.getByTestId('school-card').filter({ hasText: schoolName });
  await expect(card).toBeVisible();
  await card.click();

  await expect(page).toHaveURL(/\/schools\/[^/]+$/);
  await expect(page.getByTestId('school-page')).toBeVisible();
  const schoolId = page.url().split('/schools/')[1];
  return { email, schoolId };
}

test.describe('Alur web Analitik Lintas Sekolah', () => {
  test('lihat metrik sekolah, ikut berbagi (opt-in), lalu buka dasbor jaringan', async ({
    page,
  }) => {
    const schoolName = `SMA Analitik UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);

    // Buka halaman Analitik sekolah.
    await page.getByTestId('nav-analitik').click();
    await expect(page).toHaveURL(/\/schools\/[^/]+\/analitik$/);
    await expect(page.getByTestId('analitik-page')).toBeVisible();
    await expect(page.getByTestId('analytics-panel')).toBeVisible();
    await expect(page.getByTestId('analytics-compliance-score')).toBeVisible();
    await expect(page.getByTestId('analytics-optin-status')).toHaveText(
      'Tidak aktif',
    );

    // Ikut berbagi metrik lintas sekolah (opt-in).
    await page.getByTestId('analytics-optin-toggle').click();
    await expect(page.getByTestId('analytics-notice')).toBeVisible();
    await expect(page.getByTestId('analytics-optin-status')).toHaveText(
      'Aktif (opt-in)',
    );

    // Buka dasbor jaringan dari dashboard.
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard')).toBeVisible();
    await page.getByTestId('nav-network').click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(page.getByTestId('network-analytics-page')).toBeVisible();
    await expect(page.getByTestId('network-summary')).toContainText(
      'ikut serta',
    );
    await expect(page.getByTestId('network-documents')).toBeVisible();
  });
});
