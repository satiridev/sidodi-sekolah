import { test, expect, Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@sekolah.test`;
}

/** Registrasi lewat UI lalu buat sekolah, berakhir di halaman sekolah. */
async function signUpAndCreateSchool(
  page: Page,
  schoolName: string,
): Promise<{ email: string; schoolId: string }> {
  const email = uniqueEmail('eijazah.ui');

  await page.goto('/login');
  await expect(page.getByTestId('auth-submit')).toBeVisible();

  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Kepala Sekolah E-Ijazah');
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

/** Buat struktur akademik minimal (tahun ajaran, semester, kelas) lewat UI. */
async function createAcademicStructure(page: Page): Promise<void> {
  await page.getByTestId('academic-year-name').fill('2025/2026');
  await page.getByTestId('academic-year-start').fill('2025-07-01');
  await page.getByTestId('academic-year-end').fill('2026-06-30');
  await page.getByTestId('create-academic-year').click();
  await expect(page.getByTestId('academic-year-list')).toContainText('2025/2026');

  await page.getByTestId('semester-name').fill('Ganjil');
  await page.getByTestId('create-semester').click();
  await expect(page.getByTestId('semester-list')).toContainText('Ganjil');

  await page.getByTestId('classroom-name').fill('XII-1');
  await page.getByTestId('classroom-grade').fill('12');
  await page.getByTestId('create-classroom').click();
  await expect(page.getByTestId('classroom-list')).toContainText('XII-1');
}

test.describe('Alur web E-Ijazah', () => {
  test('buat ijazah, terbitkan, dan verifikasi', async ({ page, browser }) => {
    const schoolName = `SMA Ijazah UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);
    await createAcademicStructure(page);

    // Tambah seorang siswa dan tugaskan ke kelas lewat workspace E-Raport.
    await page.getByTestId('nav-eraport').click();
    await expect(page.getByTestId('students-page')).toBeVisible();
    await page.getByTestId('student-name').fill('Ivan Kurniawan');
    await page.getByTestId('student-nisn').fill('9001');
    await page.getByTestId('create-student').click();
    await expect(page.getByTestId('student-list')).toContainText('Ivan Kurniawan');
    await page.getByTestId('available-student-checkbox').first().check();
    await page.getByTestId('assign-submit').click();
    await expect(page.getByTestId('assigned-list')).toContainText('Ivan Kurniawan');

    // Kembali ke halaman sekolah lalu buka E-Ijazah.
    await page.getByTestId('students-page').getByRole('link').first().click();
    await expect(page.getByTestId('school-page')).toBeVisible();
    await page.getByTestId('nav-eijazah').click();
    await expect(page).toHaveURL(/\/schools\/[^/]+\/eijazah$/);
    await expect(page.getByTestId('eijazah-page')).toBeVisible();
    await expect(page.getByTestId('eijazah-panel')).toBeVisible();

    // Buat batch untuk tahun ajaran aktif.
    await page.getByTestId('create-eijazah-batch').click();
    await expect(page.getByTestId('eijazah-batch-list')).toContainText(
      '2025/2026',
    );
    await expect(page.getByTestId('eijazah-notice')).toContainText('Batch ijazah');

    // Generate sertifikat untuk seluruh siswa.
    await page.getByTestId('generate-eijazah').click();
    await expect(page.getByTestId('eijazah-certificate-list')).toBeVisible();
    const row = page
      .getByTestId('eijazah-certificate-row')
      .filter({ hasText: 'Ivan Kurniawan' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('draft');

    // Terbitkan ijazah.
    await row.getByTestId('issue-eijazah').click();
    await expect(
      page.getByTestId('eijazah-certificate-row').filter({ hasText: 'Ivan Kurniawan' }),
    ).toContainText('issued');
    await expect(row.getByTestId('download-eijazah')).toHaveAttribute(
      'href',
      /\/eijazah\/certificates\/.+\/pdf/,
    );

    // Ambil nomor seri lalu verifikasi lewat panel.
    const serial = (
      await page
        .getByTestId('eijazah-certificate-row')
        .filter({ hasText: 'Ivan Kurniawan' })
        .getByTestId('eijazah-serial')
        .textContent()
    )?.trim();
    expect(serial).toBeTruthy();

    await page.getByTestId('verify-serial').fill(serial!);
    await page.getByTestId('verify-submit').click();
    await expect(page.getByTestId('verify-result')).toContainText('VALID');
    await expect(page.getByTestId('verify-result')).toContainText(
      'Ivan Kurniawan',
    );

    // Halaman verifikasi publik dapat diakses tanpa sesi (konteks anonim).
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`/verify/${encodeURIComponent(serial!)}`);
    await expect(anonPage.getByTestId('verify-status')).toHaveAttribute(
      'data-valid',
      'true',
    );
    await expect(anonPage.getByTestId('verify-status')).toContainText(
      'Ivan Kurniawan',
    );
    await anon.close();
  });
});
