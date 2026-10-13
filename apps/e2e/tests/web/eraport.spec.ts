import { test, expect, Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@sekolah.test`;
}

/** Registrasi lewat UI lalu buat sekolah, berakhir di halaman sekolah. */
async function signUpAndCreateSchool(
  page: Page,
  schoolName: string,
): Promise<{ email: string; schoolId: string }> {
  const email = uniqueEmail('eraport.ui');

  await page.goto('/login');
  await expect(page.getByTestId('auth-submit')).toBeVisible();

  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Kepala Sekolah E-Raport');
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

  await page.getByTestId('classroom-name').fill('7A');
  await page.getByTestId('classroom-grade').fill('7');
  await page.getByTestId('create-classroom').click();
  await expect(page.getByTestId('classroom-list')).toContainText('7A');
}

test.describe('Alur web E-Raport', () => {
  test('kelola siswa, nilai, dan generate raport PDF', async ({ page }) => {
    const schoolName = `SMA Rapor UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);
    await createAcademicStructure(page);

    // Masuk ke workspace E-Raport lewat tautan navigasi.
    await page.getByTestId('nav-eraport').click();
    await expect(page).toHaveURL(/\/schools\/[^/]+\/students$/);
    await expect(page.getByTestId('students-page')).toBeVisible();
    await expect(page.getByTestId('eraport-panel')).toBeVisible();

    // Tambah data siswa.
    await page.getByTestId('student-name').fill('Hana Salsabila');
    await page.getByTestId('student-nisn').fill('3001');
    await page.getByTestId('create-student').click();
    await expect(page.getByTestId('student-list')).toContainText('Hana Salsabila');
    await expect(page.getByTestId('eraport-notice')).toContainText('Siswa ditambahkan');

    // Tambah mata pelajaran.
    await page.getByTestId('subject-name').fill('Matematika');
    await page.getByTestId('subject-code').fill('MAT');
    await page.getByTestId('create-subject').click();
    await expect(page.getByTestId('subject-list')).toContainText('Matematika');

    // Tugaskan siswa ke kelas (hanya ada satu siswa, centang yang pertama).
    await page.getByTestId('available-student-checkbox').first().check();
    await page.getByTestId('assign-submit').click();
    await expect(page.getByTestId('assigned-list')).toContainText('Hana Salsabila');

    // Input nilai untuk mapel Matematika.
    await page.getByTestId('grade-subject').selectOption({ label: 'Matematika' });
    await page.getByTestId('grade-input').first().fill('90');
    await page.getByTestId('save-grades').click();
    await expect(page.getByTestId('eraport-notice')).toContainText('nilai disimpan');

    // Generate raport PDF.
    await page.getByTestId('generate-report-cards').click();
    await expect(page.getByTestId('report-card-list')).toBeVisible();
    const row = page
      .getByTestId('report-card-row')
      .filter({ hasText: 'Hana Salsabila' });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('download-report-card')).toHaveAttribute(
      'href',
      /\/report-cards\/.+\/pdf/,
    );
  });
});
