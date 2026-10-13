import { test, expect, Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@sekolah.test`;
}

/** Registrasi lewat UI lalu buat sekolah, berakhir di halaman sekolah. */
async function signUpAndCreateSchool(
  page: Page,
  schoolName: string,
): Promise<{ email: string; schoolId: string }> {
  const email = uniqueEmail('kepsek.ui');

  await page.goto('/login');
  await expect(page.getByTestId('auth-submit')).toBeVisible();

  // Beralih ke mode daftar.
  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Kepala Sekolah UI');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill('rahasia123');
  await page.getByTestId('auth-submit').click();

  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByTestId('user-name')).toHaveText('Kepala Sekolah UI');

  // Buat sekolah.
  await page.getByTestId('new-school-name').fill(schoolName);
  await page.getByTestId('new-school-city').fill('Bekasi');
  await page.getByTestId('create-school-submit').click();

  const card = page.getByTestId('school-card').filter({ hasText: schoolName });
  await expect(card).toBeVisible();
  await card.click();

  await expect(page).toHaveURL(/\/schools\/[^/]+$/);
  await expect(page.getByTestId('school-page')).toBeVisible();
  const schoolId = page.url().split('/schools/')[1];
  return { email, schoolId };
}

test.describe('Alur web end-to-end', () => {
  test('daftar -> buat sekolah -> unggah dokumen -> lihat dokumen & skor', async ({
    page,
  }) => {
    const schoolName = `SMA Uji UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);

    // Skor kepatuhan awal tampil sebagai angka.
    await expect(page.getByTestId('compliance-score')).toBeVisible();
    await expect(page.getByTestId('compliance-score')).not.toHaveText('-');

    // Unggah dokumen.
    await page.getByTestId('upload-doc-type').selectOption({ index: 1 });
    await page.getByTestId('upload-file').setInputFiles({
      name: 'surat-keterangan-uji.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Isi dokumen uji UI ' + Date.now()),
    });
    await page.getByTestId('upload-submit').click();

    await expect(page.getByTestId('upload-result')).toContainText(
      'berhasil diunggah',
    );

    // Dokumen muncul di daftar.
    const row = page.getByTestId('document-row').filter({
      hasText: 'surat-keterangan-uji',
    });
    await expect(row).toBeVisible();
    await expect(row).toContainText('active');
  });

  test('buat tahun ajaran/semester/kelas lalu generate struktur folder', async ({
    page,
  }) => {
    const schoolName = `SMA Folder UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);

    // Tahun ajaran lewat UI (default form sudah terisi 2025/2026).
    await page.getByTestId('academic-year-name').fill('2025/2026');
    await page.getByTestId('academic-year-start').fill('2025-07-01');
    await page.getByTestId('academic-year-end').fill('2026-06-30');
    await page.getByTestId('create-academic-year').click();
    await expect(page.getByTestId('academic-notice')).toContainText('2025/2026');
    await expect(page.getByTestId('academic-year-list')).toContainText('2025/2026');

    // Semester lewat UI.
    await page.getByTestId('semester-name').fill('Ganjil');
    await page.getByTestId('create-semester').click();
    await expect(page.getByTestId('academic-notice')).toContainText('Ganjil');
    await expect(page.getByTestId('semester-list')).toContainText('Ganjil');

    // Kelas lewat UI.
    await page.getByTestId('classroom-name').fill('7A');
    await page.getByTestId('classroom-grade').fill('7');
    await page.getByTestId('create-classroom').click();
    await expect(page.getByTestId('classroom-list')).toContainText('7A');

    // Generate struktur folder memakai struktur akademik tersebut.
    await page.getByTestId('generate-folders').click();
    await expect(page.getByTestId('folders-result')).toBeVisible();
    await expect(page.getByTestId('folder-tree')).toContainText('Arsip Sekolah');
    await expect(page.getByTestId('folder-tree')).toContainText(
      '01_Administrasi_Umum',
    );
    await expect(page.getByTestId('folder-tree')).toContainText('7A');
  });

  test('unggah dokumen -> tetapkan legal hold -> lihat jejak audit', async ({
    page,
  }) => {
    const schoolName = `SMA Legal UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);

    // Aturan retensi default otomatis untuk sekolah baru.
    await expect(page.getByTestId('retention-rule-item').first()).toBeVisible();

    // Unggah dokumen.
    await page.getByTestId('upload-doc-type').selectOption({ index: 1 });
    await page.getByTestId('upload-file').setInputFiles({
      name: 'ijazah-legal-hold.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Dokumen untuk legal hold ' + Date.now()),
    });
    await page.getByTestId('upload-submit').click();
    await expect(page.getByTestId('upload-result')).toContainText(
      'berhasil diunggah',
    );

    // Tetapkan legal hold dengan alasan.
    const row = page
      .getByTestId('document-row')
      .filter({ hasText: 'ijazah-legal-hold' });
    await row.getByTestId('set-hold').click();
    await page.getByTestId('legal-hold-reason').fill('Sengketa ijazah siswa');
    await page.getByTestId('legal-hold-confirm').click();

    await expect(row.getByTestId('legal-hold-badge')).toBeVisible();

    // Jejak audit mencatat aktivitas.
    await expect(page.getByTestId('audit-log-row').first()).toBeVisible();
  });
});
