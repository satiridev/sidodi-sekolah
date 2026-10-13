'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { ApiError } from '../../lib/api';

type Mode = 'login' | 'register';

/** Tujuan setelah login: parameter ?next= (relatif) atau /dashboard. */
function nextPath(): string {
  if (typeof window === 'undefined') return '/dashboard';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') ? next : '/dashboard';
}

export default function LoginPage() {
  const router = useRouter();
  const { ready, user, login, register } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(nextPath());
  }, [ready, user, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      router.push(nextPath());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 460 }}>
      <header className="topbar">
        <Link className="brand" href="/">
          Arsip Digital Sekolah
        </Link>
      </header>

      <div className="card">
        <h2>{mode === 'login' ? 'Masuk' : 'Daftar Akun'}</h2>
        <p className="muted">
          {mode === 'login'
            ? 'Masuk untuk mengelola arsip sekolah Anda.'
            : 'Buat akun kepala sekolah untuk memulai.'}
        </p>

        {error && (
          <div className="alert alert-error" role="alert" data-testid="auth-error">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit}>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="name">Nama</label>
              <input
                id="name"
                data-testid="auth-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              data-testid="auth-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Kata sandi</label>
            <input
              id="password"
              type="password"
              data-testid="auth-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
            data-testid="auth-submit"
            style={{ width: '100%' }}
          >
            {submitting
              ? 'Memproses...'
              : mode === 'login'
                ? 'Masuk'
                : 'Daftar'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 16 }}>
          {mode === 'login' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <button
            type="button"
            className="btn btn-ghost"
            data-testid="auth-toggle"
            onClick={() => {
              setError(null);
              setMode(mode === 'login' ? 'register' : 'login');
            }}
          >
            {mode === 'login' ? 'Daftar' : 'Masuk'}
          </button>
        </p>
      </div>
    </main>
  );
}
