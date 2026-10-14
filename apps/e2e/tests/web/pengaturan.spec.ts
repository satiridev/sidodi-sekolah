import { test, expect, Page } from '@playwright/test';

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@sekolah.test`;
}

/** Registrasi lewat UI lalu buat sekolah, berakhir di halaman sekolah. */
async function signUpAndCreateSchool(
  page: Page,
  schoolName: string,
): Promise<{ email: string; schoolId: string }> {
  const email = uniqueEmail('pengaturan.ui');

  await page.goto('/login');
  await expect(page.getByTestId('auth-submit')).toBeVisible();

  await page.getByTestId('auth-toggle').click();
  await page.getByTestId('auth-name').fill('Kepala Sekolah Pengaturan');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill('rahasia123');
  await page.getByTestId('auth-submit').click();

  await expect(page.getByTestId('dashboard')).toBeVisible();

  await page.getByTestId('new-school-name').fill(schoolName);
  await page.getByTestId('new-school-city').fill('Surabaya');
  await page.getByTestId('create-school-submit').click();

  const card = page.getByTestId('school-card').filter({ hasText: schoolName });
  await expect(card).toBeVisible();
  await card.click();

  await expect(page).toHaveURL(/\/schools\/[^/]+$/);
  await expect(page.getByTestId('school-page')).toBeVisible();
  const schoolId = page.url().split('/schools/')[1];
  return { email, schoolId };
}

test.describe('Alur web Integrasi & Pengaturan', () => {
  test('SSO, backup, API key, webhook, dan agent on-prem', async ({ page }) => {
    const schoolName = `SMA Pengaturan UI ${Date.now()}`;
    await signUpAndCreateSchool(page, schoolName);

    // Buka halaman Integrasi & Pengaturan.
    await page.getByTestId('nav-pengaturan').click();
    await expect(page).toHaveURL(/\/schools\/[^/]+\/pengaturan$/);
    await expect(page.getByTestId('pengaturan-page')).toBeVisible();
    await expect(page.getByTestId('integrations-panel')).toBeVisible();

    // ---- SSO Belajar.id ----
    await page.getByTestId('sso-domain').fill('sekolah-pengaturan.sch.id');
    await page
      .getByTestId('sso-client-id')
      .fill('1234567890-pengaturan.apps.googleusercontent.com');
    await page.getByTestId('sso-auto-join').check();
    await page.getByTestId('sso-default-role').selectOption('teacher');
    await page.getByTestId('sso-active').check();
    await page.getByTestId('sso-submit').click();
    await expect(page.getByTestId('settings-notice')).toBeVisible();

    // Nilai tersimpan setelah muat ulang.
    await page.reload();
    await expect(page.getByTestId('sso-domain')).toHaveValue(
      'sekolah-pengaturan.sch.id',
    );
    await expect(page.getByTestId('sso-default-role')).toHaveValue('teacher');
    await expect(page.getByTestId('sso-auto-join')).toBeChecked();

    // ---- Backup ----
    await page.getByTestId('backup-target').selectOption('onprem');
    await page.getByTestId('backup-retention').fill('14');
    await page.getByTestId('backup-active').check();
    await page.getByTestId('backup-submit').click();
    await expect(page.getByTestId('settings-notice')).toContainText(
      'backup disimpan',
    );

    await page.getByTestId('backup-run').click();
    await expect(page.getByTestId('backup-jobs')).toBeVisible();
    await expect(page.getByTestId('backup-job-status').first()).toHaveText(
      'queued',
    );

    // ---- API key ----
    const keyName = `Kunci ${Date.now()}`;
    await page.getByTestId('apikey-name').fill(keyName);
    await page.getByTestId('apikey-submit').click();
    await expect(page.getByTestId('apikey-created')).toBeVisible();
    await expect(page.getByTestId('apikey-secret')).toHaveText(/^ak_[0-9a-f]{48}$/);

    const keyRow = page
      .getByTestId('apikey-row')
      .filter({ hasText: keyName });
    await expect(keyRow).toBeVisible();
    await keyRow.getByTestId('apikey-revoke').click();
    await expect(keyRow).toContainText('dicabut');

    // ---- Webhook (validasi URL + buat + hapus) ----
    await page.getByTestId('webhook-url').fill('bukan-url');
    await page.getByTestId('webhook-submit').click();
    await expect(page.getByTestId('settings-error')).toBeVisible();

    const hookUrl = `https://hooks.${Date.now()}.test/arsip`;
    await page.getByTestId('webhook-url').fill(hookUrl);
    await page.getByTestId('webhook-submit').click();
    await expect(page.getByTestId('webhook-created')).toBeVisible();
    await expect(page.getByTestId('webhook-secret')).not.toBeEmpty();

    const hookRow = page.getByTestId('webhook-row').filter({ hasText: hookUrl });
    await expect(hookRow).toBeVisible();
    await hookRow.getByTestId('webhook-delete').click();
    await expect(
      page.getByTestId('webhook-row').filter({ hasText: hookUrl }),
    ).toHaveCount(0);

    // ---- Agent on-prem ----
    const agentName = `Agent ${Date.now()}`;
    await page.getByTestId('agent-name').fill(agentName);
    await page.getByTestId('agent-version').fill('1.0.0');
    await page.getByTestId('agent-submit').click();
    await expect(page.getByTestId('agent-created')).toBeVisible();
    await expect(page.getByTestId('agent-token')).not.toBeEmpty();

    const agentRow = page
      .getByTestId('agent-row')
      .filter({ hasText: agentName });
    await expect(agentRow).toBeVisible();
    await expect(agentRow.getByTestId('agent-status')).toHaveText('offline');
  });
});
