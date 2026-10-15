import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { provisionDemo, type DemoData, type DemoRole } from './provision';

/**
 * Generator tangkapan layar untuk panduan pengguna.
 *
 * Bukan bagian dari suite e2e default. Jalankan dengan:
 *
 *   npm run docs:screenshots --workspace @arsip/e2e
 *
 * Hasil PNG ditulis ke `docs/panduan-pengguna/gambar/`. Data demo disiapkan
 * lewat API pada `beforeAll` (idempoten) sehingga dapat dijalankan berulang.
 */

const IMG_DIR = path.resolve(
  __dirname,
  '../../../../docs/panduan-pengguna/gambar',
);
const AUTH_COOKIE = 'arsip_token';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

let demo: DemoData;
let dispose: () => Promise<void>;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const provisioned = await provisionDemo();
  demo = provisioned.data;
  dispose = provisioned.dispose;
});

test.afterAll(async () => {
  if (dispose) await dispose();
});

/** Sembunyikan elemen pengembangan Next.js agar tangkapan layar bersih. */
async function polish(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content: [
        'nextjs-portal{display:none!important}',
        '[data-nextjs-toast]{display:none!important}',
        '*{transition:none!important;animation:none!important}',
      ].join(''),
    })
    .catch(() => undefined);
  await page.emulateMedia({ reducedMotion: 'reduce' }).catch(() => undefined);
}

/** Buka URL dan tunggu elemen penanda siap. */
async function gotoReady(page: Page, url: string, readyTestId: string) {
  await page.goto(url);
  await page
    .getByTestId(readyTestId)
    .first()
    .waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(500);
  await polish(page);
}

const p = (name: string) => path.join(IMG_DIR, `${name}.png`);

/**
 * Pastikan halaman tidak menampilkan galat (mis. 403 yang mengosongkan halaman).
 * Tangkapan layar yang menampilkan galat tidak layak untuk panduan.
 */
async function expectNoPageError(page: Page) {
  await expect(page.getByTestId('page-error')).toHaveCount(0);
}

/** Tangkapan layar area viewport (bagian atas halaman). */
async function shot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: p(name) });
}

/** Tangkapan layar satu kartu (`.card`) berdasarkan judul `<h3>`. */
async function shotCard(page: Page, heading: string, name: string) {
  const card = page
    .locator('.card', { has: page.locator('h3', { hasText: heading }) })
    .first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await card.screenshot({ path: p(name) });
}

/** Buka halaman sekolah sebuah peran (sesi diset melalui cookie). */
async function contextFor(
  context: BrowserContext,
  role: DemoRole,
): Promise<void> {
  await context.addCookies([
    { name: AUTH_COOKIE, value: demo.users[role].token, url: WEB_URL },
  ]);
}

const school = () => demo.schoolId;

test('halaman masuk (semua peran)', async ({ page }) => {
  await page.goto(`${WEB_URL}/login`);
  await page.getByTestId('auth-email').waitFor({ state: 'visible' });
  await polish(page);
  await shot(page, 'umum-01-halaman-masuk');
});

test('panduan peran: kepala sekolah', async ({ page, context }) => {
  await contextFor(context, 'headmaster');
  const base = `/schools/${school()}`;

  await gotoReady(page, '/dashboard', 'dashboard');
  await shot(page, 'kepala-sekolah-01-dasbor');

  await gotoReady(page, base, 'school-page');
  await expectNoPageError(page);
  await expect(page.getByTestId('compliance-score')).toBeVisible();
  await expect(page.getByTestId('audit-log-list')).toBeVisible();
  await shot(page, 'kepala-sekolah-02-sekolah');
  await shotCard(page, 'Skor Kepatuhan', 'kepala-sekolah-03-skor-kepatuhan');
  await shotCard(page, 'Unggah Dokumen', 'kepala-sekolah-04-unggah-dokumen');
  await shotCard(page, 'Dokumen (', 'kepala-sekolah-05-daftar-dokumen');
  await shotCard(page, 'Jejak Audit', 'kepala-sekolah-06-jejak-audit');

  await gotoReady(page, `${base}/students`, 'students-page');
  await expect(page.getByTestId('eraport-error')).toHaveCount(0);
  await shot(page, 'kepala-sekolah-07-eraport');

  await gotoReady(page, `${base}/eijazah`, 'eijazah-page');
  await expect(page.getByTestId('eijazah-error')).toHaveCount(0);
  await shot(page, 'kepala-sekolah-08-eijazah');

  await gotoReady(page, `${base}/keuangan`, 'keuangan-page');
  await expect(page.getByTestId('finance-error')).toHaveCount(0);
  await shot(page, 'kepala-sekolah-09-keuangan');

  await gotoReady(page, `${base}/analitik`, 'analitik-page');
  await expect(page.getByTestId('analytics-error')).toHaveCount(0);
  await shot(page, 'kepala-sekolah-10-analitik');
  await shotCard(
    page,
    'Dokumen & Retensi',
    'kepala-sekolah-11-analitik-retensi',
  );

  await gotoReady(page, `${base}/pengaturan`, 'pengaturan-page');
  await expect(page.getByTestId('settings-no-access')).toHaveCount(0);
  await shotCard(page, 'SSO Belajar.id', 'kepala-sekolah-12-integrasi-sso');
  await shotCard(page, 'Backup Berlapis', 'kepala-sekolah-13-integrasi-backup');

  await gotoReady(page, '/analytics', 'network-analytics-page');
  await expect(page.getByTestId('network-forbidden')).toHaveCount(0);
  await expect(page.getByTestId('network-summary')).toBeVisible();
  await shot(page, 'kepala-sekolah-14-analitik-jaringan');
});

test('panduan peran: kepala tata usaha', async ({ page, context }) => {
  await contextFor(context, 'head_of_administration');
  const base = `/schools/${school()}`;

  await gotoReady(page, '/dashboard', 'dashboard');
  await shot(page, 'kepala-tu-01-dasbor');

  await gotoReady(page, base, 'school-page');
  await expectNoPageError(page);
  await expect(page.getByTestId('compliance-score')).toBeVisible();
  await expect(page.getByTestId('audit-log-list')).toBeVisible();
  await shot(page, 'kepala-tu-02-sekolah');
  await shotCard(page, 'Skor Kepatuhan', 'kepala-tu-03-skor-kepatuhan');
  await shotCard(page, 'Unggah Dokumen', 'kepala-tu-04-unggah-dokumen');

  await gotoReady(page, `${base}/keuangan`, 'keuangan-page');
  await expect(page.getByTestId('finance-error')).toHaveCount(0);
  await shot(page, 'kepala-tu-05-keuangan');

  await gotoReady(page, `${base}/pengaturan`, 'pengaturan-page');
  await expect(page.getByTestId('settings-no-access')).toHaveCount(0);
  await shotCard(page, 'Backup Berlapis', 'kepala-tu-06-integrasi-backup');
});

test('panduan peran: guru', async ({ page, context }) => {
  await contextFor(context, 'teacher');
  const base = `/schools/${school()}`;

  await gotoReady(page, '/dashboard', 'dashboard');
  await shot(page, 'guru-01-dasbor');

  await gotoReady(page, base, 'school-page');
  await expectNoPageError(page);
  // Guru tidak berhak melihat skor kepatuhan & jejak audit; halaman tetap utuh.
  await expect(page.getByTestId('compliance-score')).toHaveCount(0);
  await expect(page.getByTestId('audit-log-list')).toHaveCount(0);
  await expect(page.getByTestId('upload-submit')).toBeVisible();
  await shot(page, 'guru-02-sekolah');
  await shotCard(page, 'Unggah Dokumen', 'guru-03-unggah-dokumen');
  await shotCard(page, 'Dokumen (', 'guru-04-daftar-dokumen');

  await gotoReady(page, `${base}/pencarian`, 'pencarian-page');
  await expect(page.getByTestId('search-error')).toHaveCount(0);
  await page.getByTestId('search-input').fill('Siswa');
  await page.getByTestId('search-submit').click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('search-result').first()).toBeVisible();
  await shot(page, 'guru-05-pencarian');

  await gotoReady(page, `${base}/students`, 'students-page');
  await expect(page.getByTestId('eraport-error')).toHaveCount(0);
  await shot(page, 'guru-06-eraport');
  await page.getByTestId('grade-classroom').selectOption({ label: 'X IPA 1' });
  await page.getByTestId('grade-subject').selectOption({ label: 'Matematika' });
  await expect(page.getByTestId('grade-input').first()).toBeVisible();
  await shotCard(page, 'Entri Nilai', 'guru-07-eraport-nilai');
});

test('panduan peran: operator', async ({ page, context }) => {
  await contextFor(context, 'operator');
  const base = `/schools/${school()}`;

  await gotoReady(page, '/dashboard', 'dashboard');
  await shot(page, 'operator-01-dasbor');

  await gotoReady(page, base, 'school-page');
  await expectNoPageError(page);
  // Operator berhak melihat skor kepatuhan, tetapi tidak jejak audit.
  await expect(page.getByTestId('compliance-score')).toBeVisible();
  await expect(page.getByTestId('audit-log-list')).toHaveCount(0);
  await shot(page, 'operator-02-sekolah');
  await shotCard(page, 'Dokumen (', 'operator-03-daftar-dokumen');

  await gotoReady(page, `${base}/students`, 'students-page');
  await expect(page.getByTestId('eraport-error')).toHaveCount(0);
  await shot(page, 'operator-04-eraport');

  await gotoReady(page, `${base}/eijazah`, 'eijazah-page');
  await expect(page.getByTestId('eijazah-error')).toHaveCount(0);
  await shot(page, 'operator-05-eijazah');
});

test('panduan peran: auditor', async ({ page, context }) => {
  await contextFor(context, 'auditor');
  const base = `/schools/${school()}`;

  await gotoReady(page, '/dashboard', 'dashboard');
  await shot(page, 'auditor-01-dasbor');

  await gotoReady(page, base, 'school-page');
  await expectNoPageError(page);
  await expect(page.getByTestId('compliance-score')).toBeVisible();
  await expect(page.getByTestId('audit-log-list')).toBeVisible();
  await shot(page, 'auditor-02-sekolah');
  await shotCard(page, 'Skor Kepatuhan', 'auditor-03-skor-kepatuhan');
  await shotCard(page, 'Jejak Audit', 'auditor-04-jejak-audit');

  await gotoReady(page, `${base}/pencarian`, 'pencarian-page');
  await expect(page.getByTestId('search-error')).toHaveCount(0);
  await page.getByTestId('search-input').fill('Siswa');
  await page.getByTestId('search-submit').click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('search-result').first()).toBeVisible();
  await shot(page, 'auditor-05-pencarian');

  await gotoReady(page, `${base}/analitik`, 'analitik-page');
  await expect(page.getByTestId('analytics-error')).toHaveCount(0);
  await shot(page, 'auditor-06-analitik');

  await gotoReady(page, `${base}/pengaturan`, 'pengaturan-page');
  await expect(page.getByTestId('settings-no-access')).toHaveCount(0);
  await shotCard(page, 'API Key', 'auditor-07-integrasi-api-key');

  await gotoReady(page, '/analytics', 'network-analytics-page');
  await expect(page.getByTestId('network-forbidden')).toHaveCount(0);
  await expect(page.getByTestId('network-summary')).toBeVisible();
  await shot(page, 'auditor-08-analitik-jaringan');
});
