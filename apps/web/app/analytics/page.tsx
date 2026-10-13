'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { api, ApiError, type NetworkAnalytics } from '../../lib/api';

function formatBytes(value: string | number | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

/**
 * Dasbor Analitik Lintas Sekolah (yayasan/dinas): agregat anonim dari sekolah
 * yang ikut serta (opt-in). Hanya kepala sekolah/auditor aktif yang boleh
 * mengakses. Dilindungi middleware (`/analytics`).
 */
export default function NetworkAnalyticsPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const [data, setData] = useState<NetworkAnalytics | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        setData(await api.networkAnalytics());
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true);
        } else {
          setError(
            err instanceof ApiError ? err.message : 'Gagal memuat metrik jaringan',
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, user, router]);

  if (!ready || loading) {
    return (
      <main className="container">
        <p className="muted">Memuat...</p>
      </main>
    );
  }

  return (
    <main className="container" data-testid="network-analytics-page">
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          Analitik Jaringan (Yayasan/Dinas)
        </Link>
        <div className="nav">
          <span className="whoami">{user?.name}</span>
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

      {error && (
        <div className="alert alert-error" data-testid="network-error">
          {error}
        </div>
      )}

      {forbidden && (
        <div className="card" data-testid="network-forbidden">
          <h3>Akses terbatas</h3>
          <p className="muted">
            Dasbor lintas sekolah hanya untuk kepala sekolah atau auditor yang
            aktif pada minimal satu sekolah.
          </p>
          <Link className="btn btn-ghost" href="/dashboard">
            ← Kembali ke dasbor
          </Link>
        </div>
      )}

      {data && (
        <>
          <p className="muted" data-testid="network-summary">
            {data.schools.optedIn} sekolah ikut serta (opt-in) · diperbarui{' '}
            {new Date(data.generatedAt).toLocaleString('id-ID')}
          </p>

          <div className="grid">
            <div className="card">
              <h3>Sekolah Opt-in</h3>
              <div className="score" data-testid="network-schools">
                {data.schools.optedIn}
              </div>
            </div>
            <div className="card">
              <h3>Rata-rata Kepatuhan</h3>
              <div className="score" data-testid="network-avg-compliance">
                {data.compliance.averageScore === null
                  ? '-'
                  : data.compliance.averageScore.toFixed(2)}
              </div>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {data.compliance.schoolsWithScore} sekolah berskor
              </p>
            </div>
            <div className="card">
              <h3>Penyimpanan Agregat</h3>
              <p style={{ margin: 0 }} data-testid="network-storage">
                {formatBytes(data.storage.usedBytes)} /{' '}
                {formatBytes(data.storage.quotaBytes)}
              </p>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Terpakai {data.storage.usagePercent}%
              </p>
            </div>
            <div className="card">
              <h3>Total Dokumen</h3>
              <div className="score" data-testid="network-documents">
                {data.documents.total}
              </div>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {data.documents.legalHold} dalam legal hold
              </p>
            </div>
          </div>

          <div className="card">
            <h3>Distribusi Kepatuhan</h3>
            {data.compliance.distribution.length === 0 ? (
              <p className="empty" data-testid="network-distribution-empty">
                Belum ada snapshot kepatuhan.
              </p>
            ) : (
              <table data-testid="network-distribution">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Jumlah sekolah</th>
                  </tr>
                </thead>
                <tbody>
                  {data.compliance.distribution.map((row) => (
                    <tr key={row.status} data-testid="network-distribution-row">
                      <td>{statusLabel(row.status)}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3>Sebaran Paket Langganan</h3>
            {data.schools.byPlan.length === 0 ? (
              <p className="empty">Belum ada sekolah opt-in.</p>
            ) : (
              <table data-testid="network-plans">
                <thead>
                  <tr>
                    <th>Paket</th>
                    <th>Jumlah sekolah</th>
                  </tr>
                </thead>
                <tbody>
                  {data.schools.byPlan.map((row) => (
                    <tr key={row.plan} data-testid="network-plan-row">
                      <td>{row.planName}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3>Tren Unggahan Agregat (6 bulan)</h3>
            {data.uploads.trend.length === 0 ? (
              <p className="empty">Belum ada data unggahan.</p>
            ) : (
              <table data-testid="network-upload-trend">
                <thead>
                  <tr>
                    <th>Bulan</th>
                    <th>Jumlah unggahan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.uploads.trend.map((point) => (
                    <tr key={point.month} data-testid="network-upload-trend-row">
                      <td>{point.month}</td>
                      <td>{point.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="muted">
            Data bersifat agregat dan anonim: tidak ada nama atau identitas
            sekolah yang ditampilkan.
          </p>
        </>
      )}
    </main>
  );
}
