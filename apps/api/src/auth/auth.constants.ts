/**
 * Konstanta & opsi cookie sesi autentikasi.
 *
 * Token JWT dikirim ganda:
 *  - di body respons (`accessToken`) untuk klien API / integrasi (Bearer);
 *  - di cookie httpOnly `arsip_token` untuk aplikasi web & middleware Next.js.
 */

export const AUTH_COOKIE = 'arsip_token';

export const AUTH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const AUTH_TOKEN_TTL_MS = AUTH_TOKEN_TTL_SECONDS * 1000;

export interface AuthCookieOptions {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
  path: string;
  maxAge: number;
  domain?: string;
}

/**
 * Opsi cookie sesi. `COOKIE_DOMAIN` opsional untuk deployment lintas subdomain
 * (mis. `.sekolah.id`); pada development localhost dibiarkan kosong (host-only).
 */
export function authCookieOptions(): AuthCookieOptions {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_TOKEN_TTL_MS,
    ...(domain ? { domain } : {}),
  };
}
