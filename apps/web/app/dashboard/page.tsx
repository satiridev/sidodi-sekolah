'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { api, ApiError } from '../../lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const { ready, user, memberships, refresh, logout } = useAuth();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api.createSchool({ name, city: city || undefined });
      setName('');
      setCity('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan');
    } finally {
      setCreating(false);
    }
  }

  if (!ready) {
    return (
      <main className="container">
        <p className="muted">Memuat...</p>
      </main>
    );
  }

  return (
    <main className="container" data-testid="dashboard">
      <header className="topbar">
        <Link className="brand" href="/">
          Arsip Digital Sekolah
        </Link>
        <div className="nav">
          <span className="whoami" data-testid="user-name">
            {user?.name}
          </span>
          <button
            className="btn btn-ghost"
            data-testid="logout"
            onClick={async () => {
              await logout();
              router.replace('/login');
            }}
          >
            Keluar
          </button>
        </div>
      </header>

      <div className="card">
        <h2>Buat Sekolah</h2>
        <p className="muted">
          Anda otomatis menjadi kepala sekolah pada sekolah yang dibuat.
        </p>
        {error && (
          <div className="alert alert-error" data-testid="create-school-error">
            {error}
          </div>
        )}
        <form onSubmit={onCreate} className="form-row">
          <div className="field">
            <label htmlFor="school-name">Nama sekolah</label>
            <input
              id="school-name"
              data-testid="new-school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="field">
            <label htmlFor="school-city">Kota (opsional)</label>
            <input
              id="school-city"
              data-testid="new-school-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={creating}
              data-testid="create-school-submit"
            >
              {creating ? 'Menyimpan...' : 'Buat Sekolah'}
            </button>
          </div>
        </form>
      </div>

      <h2>Sekolah Saya</h2>
      {memberships.length === 0 ? (
        <p className="empty" data-testid="school-empty">
          Belum ada sekolah. Buat sekolah pertama Anda di atas.
        </p>
      ) : (
        <div className="grid" data-testid="school-list">
          {memberships.map((m) => (
            <Link
              key={m.id}
              className="school-card"
              href={`/schools/${m.schoolId}`}
              data-testid="school-card"
            >
              <div className="role">{m.role.replace(/_/g, ' ')}</div>
              <h3 style={{ margin: '6px 0' }}>{m.school.name}</h3>
              <span className="muted">/{m.school.slug}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
