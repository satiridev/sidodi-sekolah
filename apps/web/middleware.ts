import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware proteksi rute.
 *
 * Cookie sesi (`arsip_token`, httpOnly) di-set oleh API di origin yang sama-site
 * (localhost) sehingga dapat dibaca di sini. Bila belum ada sesi, rute privat
 * dialihkan ke /login. Pemeriksaan ini lapisan pertama; API tetap memverifikasi
 * JWT di setiap permintaan.
 */

const AUTH_COOKIE = 'arsip_token';

export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(AUTH_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  const redirectTo = `${url.pathname}${url.search}`;
  url.pathname = '/login';
  url.search = '';
  if (redirectTo !== '/login') url.searchParams.set('next', redirectTo);

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/:path*', '/schools/:path*', '/analytics/:path*'],
};
