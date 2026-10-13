import { test as base, APIRequestContext } from '@playwright/test';

/**
 * Fixture test untuk API.
 *
 * Playwright menyelesaikan URL request dengan `new URL(path, baseURL)`, sehingga
 * path absolut (`/health`) akan menghapus path pada baseURL. Agar test tetap
 * ringkas (memakai path seperti `/schools/:id`), fixture ini membungkus
 * `request` dan otomatis menambahkan prefix `/api/v1` ke setiap path relatif.
 * URL absolut (http/https) dibiarkan apa adanya (mis. presigned URL /files).
 */

export { expect } from '@playwright/test';

const API_PREFIX = '/api/v1';
const URL_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const;

function prefixUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_PREFIX}${url.startsWith('/') ? url : `/${url}`}`;
}

function wrap(ctx: APIRequestContext): APIRequestContext {
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      if (!(URL_METHODS as readonly string[]).includes(prop as string)) {
        return (value as (...args: unknown[]) => unknown).bind(target);
      }
      return (url: string, options?: unknown) =>
        (value as (u: string, o?: unknown) => Promise<unknown>).call(
          target,
          prefixUrl(url),
          options,
        );
    },
  }) as APIRequestContext;
}

export const test = base.extend<{
  request: APIRequestContext;
  anonRequest: APIRequestContext;
}>({
  request: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL });
    await use(wrap(context));
    await context.dispose();
  },
  /**
   * Konteks tanpa cookie apa pun — untuk menguji akses anonim. `request` biasa
   * menyimpan cookie sesi dari pemanggilan register/login pada test yang sama,
   * sehingga permintaan berikutnya otomatis terautentikasi.
   */
  anonRequest: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL });
    await use(wrap(context));
    await context.dispose();
  },
});
