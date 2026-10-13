import { test, expect, Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@sekolah.test`;
}

/** Registrasi lewat UI lalu buat sekolah, berakhir di halaman sekolah. */
async function signUpAndCreateSchool(
  page: Page,
  schoolName: string,
): Promise<{ email: string; schoolId: string }> {
  const email = uniqueEmail('versioning.ui');

  await page.goto('/login');
  await expect(page.getByTestId('auth-submit')).toBeVisible();

  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Kepala Sekolah Versioning');
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

test.describe('Alur web versioning dokumen', () => {
  test('unggah dokumen dengan catatan, pulihkan versi, lalu bandingkan', async ({
    page,
  }) => {
    const schoolName = `SMA Versioning UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);

    // Panel versioning tampil (belum ada dokumen).
    await expect(page.getByTestId('version-panel')).toBeVisible();

    // Unggah dokumen versi pertama dengan catatan perubahan.
    await page.getByTestId('upload-doc-type').selectOption({ index: 1 });
    await page.getByTestId('upload-change-note').fill('Versi awal');
    await page.getByTestId('upload-file').setInputFiles({
      name: 'dokumen-versioning.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Versi satu ' + Date.now()),
    });
    await page.getByTestId('upload-submit').click();
    await expect(page.getByTestId('upload-result')).toContainText(
      'berhasil diunggah',
    );

    // Riwayat versi menampilkan versi 1 beserta catatan perubahan.
    await expect(page.getByTestId('version-list')).toContainText('Versi awal');
    await expect(page.getByTestId('version-row')).toHaveCount(1);
    await expect(page.getByTestId('version-number').first()).toHaveText('1');

    // Tautan unduh versi mengarah ke endpoint versi.
    await expect(page.getByTestId('version-download').first()).toHaveAttribute(
      'href',
      /\/documents\/.+\/versions\/.+\/download$/,
    );

    // Pulihkan versi 1 menjadi versi baru (2).
    await page.getByTestId('version-restore').first().click();
    await expect(page.getByTestId('version-restore-form')).toBeVisible();
    await page.getByTestId('version-restore-note').fill('Kembalikan draf awal');
    await page.getByTestId('version-restore-confirm').click();
    await expect(page.getByTestId('version-notice')).toContainText(
      'Versi 2 dibuat dari pemulihan versi 1',
    );
    await expect(page.getByTestId('version-row')).toHaveCount(2);

    // Bandingkan versi 2 (hasil restore) terhadap versi 1 → konten sama.
    await expect(page.getByTestId('version-compare-form')).toBeVisible();
    await page.getByTestId('version-compare-from').selectOption({ index: 0 });
    await page.getByTestId('version-compare-to').selectOption({ index: 1 });
    await page.getByTestId('version-compare-submit').click();
    await expect(page.getByTestId('version-compare-result')).toContainText(
      'konten sama',
    );
  });
});
