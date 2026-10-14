import { test, expect, Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@sekolah.test`;
}

/** Registrasi lewat UI lalu buat sekolah, berakhir di halaman sekolah. */
async function signUpAndCreateSchool(
  page: Page,
  schoolName: string,
): Promise<{ email: string; schoolId: string }> {
  const email = uniqueEmail('pencarian.ui');

  await page.goto('/login');
  await expect(page.getByTestId('auth-submit')).toBeVisible();

  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Kepala Sekolah Pencarian');
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

test.describe('Alur web OCR & Pencarian', () => {
  test('unggah berkas teks, jalankan OCR, cari dan lihat teks hasil ekstraksi', async ({
    page,
  }) => {
    const schoolName = `SMA Pencarian UI ${Date.now()}`;
    const keyword = `komite${Date.now()}`;
    const title = `Notulen Rapat ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);

    // Unggah berkas teks (.csv) dengan kata kunci unik di isinya.
    await page
      .getByTestId('upload-doc-type')
      .selectOption({ label: 'Data Siswa' });
    await page.getByTestId('upload-title').fill(title);
    await page.getByTestId('upload-file').setInputFiles({
      name: `notulen-${Date.now()}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `agenda,keputusan\nrapat komite ${keyword},disetujui\n`,
        'utf8',
      ),
    });
    await page.getByTestId('upload-submit').click();
    await expect(page.getByTestId('upload-result')).toBeVisible();

    // Buka halaman Pencarian.
    await page.getByTestId('nav-pencarian').click();
    await expect(page).toHaveURL(/\/schools\/[^/]+\/pencarian$/);
    await expect(page.getByTestId('pencarian-page')).toBeVisible();
    await expect(page.getByTestId('search-panel')).toBeVisible();

    // Proses OCR tertunda agar isi berkas dapat dicari.
    await page.getByTestId('search-ocr-run').click();
    await expect(page.getByTestId('search-ocr-notice')).toBeVisible();

    // Cari dengan kata kunci unik.
    await page.getByTestId('search-input').fill(keyword);
    await page.getByTestId('search-submit').click();

    await expect(page.getByTestId('search-total')).toContainText('1 dokumen');
    await expect(page.getByTestId('search-facets')).toBeVisible();

    const row = page.getByTestId('search-result').filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('search-result-title')).toHaveText(title);
    await expect(row.getByTestId('search-result-ocr')).toContainText('done');

    // Filter facet jenis dokumen (Data Siswa) → chip filter aktif muncul.
    await page.getByTestId('search-facet-type').first().click();
    await expect(page.getByTestId('search-active-type')).toBeVisible();
    await expect(page.getByTestId('search-total')).toContainText('1 dokumen');
    await page.getByTestId('search-active-type').getByRole('button').click();

    // Pratinjau teks hasil OCR memuat kata kunci.
    await row.getByTestId('search-load-text').click();
    await expect(page.getByTestId('search-extracted-text')).toContainText(
      keyword,
    );

    // Reset membersihkan hasil.
    await page.getByTestId('search-reset').click();
    await expect(page.getByTestId('search-total')).toHaveCount(0);
  });
});
