import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * Konfigurasi E2E (Playwright) untuk Arsip Digital Sekolah.
 *
 * Dua project:
 *  - `api`  : end-to-end lewat HTTP API (APIRequestContext) — inti sistem saat ini.
 *  - `web`  : browser smoke test untuk halaman web.
 *
 * Server (API + web) dijalankan otomatis oleh Playwright (`webServer`).
 * Bila sudah ada server berjalan di port yang sama, server itu dipakai ulang
 * (kecuali di CI) sehingga aman dijalankan berdampingan dengan `npm run dev`.
 *
 * Prasyarat: PostgreSQL berjalan (Docker `arsip-pg`) dengan migrasi + seed
 * yang sudah diterapkan. Lihat README (bagian "Menjalankan Test E2E").
 */

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  // Satu worker: test berbagi satu database dan membuat banyak entitas unik,
  // jadi serial lebih deterministik dan menghindari balapan.
  fullyParallel: false,
  workers: 1,

  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      // baseURL = origin; prefix `/api/v1` ditambahkan oleh fixture (lihat tests/api/fixtures.ts).
      use: { baseURL: API_ORIGIN },
    },
    {
      name: 'web',
      testDir: './tests/web',
      timeout: 60_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_URL,
        navigationTimeout: 60_000,
      },
    },
  ],

  webServer: [
    {
      // Bangun lalu jalankan API. `npm` mengeksekusi dengan cwd = apps/api,
      // sehingga ConfigModule memuat ../../.env (env root).
      command:
        'npm run build --workspace @arsip/api && npm run start --workspace @arsip/api',
      url: `${API_ORIGIN}/api/v1/health`,
      cwd: ROOT_DIR,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev --workspace @arsip/web',
      url: WEB_URL,
      cwd: ROOT_DIR,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_URL: `${API_ORIGIN}/api/v1` },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
