import { test, expect, Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@sekolah.test`;
}

/** Registrasi lewat UI lalu buat sekolah, berakhir di halaman sekolah. */
async function signUpAndCreateSchool(
  page: Page,
  schoolName: string,
): Promise<{ email: string; schoolId: string }> {
  const email = uniqueEmail('keuangan.ui');

  await page.goto('/login');
  await expect(page.getByTestId('auth-submit')).toBeVisible();

  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Kepala Sekolah Keuangan');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill('rahasia123');
  await page.getByTestId('auth-submit').click();

  await expect(page.getByTestId('dashboard')).toBeVisible();

  await page.getByTestId('new-school-name').fill(schoolName);
  await page.getByTestId('new-school-city').fill('Bandung');
  await page.getByTestId('create-school-submit').click();

  const card = page.getByTestId('school-card').filter({ hasText: schoolName });
  await expect(card).toBeVisible();
  await card.click();

  await expect(page).toHaveURL(/\/schools\/[^/]+$/);
  await expect(page.getByTestId('school-page')).toBeVisible();
  const schoolId = page.url().split('/schools/')[1];
  return { email, schoolId };
}

test.describe('Alur web Arsip Keuangan/BOS', () => {
  test('unggah dokumen, catat arsip, lihat ringkasan, ekspor paket audit', async ({
    page,
  }) => {
    const schoolName = `SMA Keuangan UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);

    // Unggah dokumen keuangan lewat UI.
    await page
      .getByTestId('upload-doc-type')
      .selectOption({ label: 'Arsip Keuangan & Dana BOS' });
    await page.getByTestId('upload-title').fill('Laporan BOS Tahap 1');
    await page.getByTestId('upload-file').setInputFiles({
      name: 'laporan-bos.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% laporan bos\n%%EOF\n'),
    });
    await page.getByTestId('upload-submit').click();
    await expect(page.getByTestId('upload-result')).toBeVisible();

    // Buka halaman Keuangan/BOS.
    await page.getByTestId('nav-keuangan').click();
    await expect(page).toHaveURL(/\/schools\/[^/]+\/keuangan$/);
    await expect(page.getByTestId('finance-panel')).toBeVisible();

    // Catat arsip keuangan bertaut dokumen.
    await page.getByTestId('finance-category').selectOption('LAPORAN_BOS');
    await page.getByTestId('finance-amount').fill('2500000');
    await page
      .getByTestId('finance-document')
      .selectOption({ label: 'Laporan BOS Tahap 1' });
    await page.getByTestId('finance-submit').click();

    await expect(page.getByTestId('finance-notice')).toBeVisible();
    const row = page
      .getByTestId('finance-row')
      .filter({ hasText: 'Laporan BOS Tahap 1' });
    await expect(row).toBeVisible();
    await expect(page.getByTestId('finance-total-count')).toHaveText('1');
    await expect(page.getByTestId('finance-total-amount')).toContainText(
      '2.500.000',
    );

    // Ekspor paket audit → browser mengunduh ZIP.
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('finance-export').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^paket-audit-.*\.zip$/);
  });
});
