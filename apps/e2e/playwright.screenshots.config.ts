import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Konfigurasi khusus untuk generator tangkapan layar dokumentasi.
 *
 * Dipisah dari `playwright.config.ts` agar tidak ikut dalam suite e2e default
 * (yang harus tetap deterministik dan hijau). Menjalankan:
 *
 *   npm run docs:screenshots
 *
 * Output: `docs/panduan-pengguna/gambar/*.png`.
 */

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  ...baseConfig,
  testDir: './tests/docs',
  reporter: [['list']],
  timeout: 120_000,
  projects: [
    {
      name: 'docs',
      testDir: './tests/docs',
      timeout: 120_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_URL,
        navigationTimeout: 60_000,
        viewport: { width: 1360, height: 900 },
      },
    },
  ],
});
