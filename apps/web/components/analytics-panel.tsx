'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type SchoolAnalytics } from '../lib/api';

function formatBytes(value: string | number | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('id-ID');
}

/**
 * Panel analitik satu sekolah: skor kepatuhan, pemakaian storage, dokumen
 * mendekati retensi, tren unggahan, serta preferensi berbagi metrik lintas
 * sekolah (opt-in).
 */
export function AnalyticsPanel({
  schoolId,
  canToggleOptIn,
}: {
  schoolId: string;
  canToggleOptIn: boolean;
}) {
  const [data, setData] = useState<SchoolAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.schoolAnalytics(schoolId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat metrik sekolah');
    }
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggleOptIn(next: boolean) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.updateSchool(schoolId, { analyticsOptIn: next });
      setNotice(
        next
          ? 'Sekolah kini ikut berbagi metrik anonim untuk dashboard yayasan/dinas.'
          : 'Sekolah berhenti berbagi metrik anonim.',
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengubah preferensi');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div data-testid="analytics-panel">
        {error && (
          <div className="alert alert-error" data-testid="analytics-error">
            {error}
          </div>
        )}
        {!error && <p className="muted">Memuat metrik...</p>}
      </div>
    );
  }

  return (
    <div data-testid="analytics-panel">
      {error && (
        <div className="alert alert-error" data-testid="analytics-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" data-testid="analytics-notice">
          {notice}
        </div>
      )}

      <div className="grid">
        <div className="card">
          <h3>Skor Kepatuhan</h3>
          <div
            className="score"
            data-testid="analytics-compliance-score"
            data-status={data.compliance.status}
          >
            {data.compliance.score.toFixed(2)}
          </div>
          <span className={`badge badge-${data.compliance.status}`}>
            {data.compliance.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="card">
          <h3>Penyimpanan</h3>
          <p style={{ margin: 0 }} data-testid="analytics-storage">
            {formatBytes(data.storage.usedBytes)} / {formatBytes(data.storage.quotaBytes)}
          </p>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Terpakai {data.storage.usagePercent}%
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Dokumen &amp; Retensi</h3>
        <table data-testid="analytics-documents">
          <tbody>
            <tr>
              <td>Total dokumen</td>
              <td data-testid="analytics-doc-total">{data.documents.total}</td>
            </tr>
            <tr>
              <td>Mendekati retensi (≤ 90 hari)</td>
              <td data-testid="analytics-nearing-retention">
                {data.documents.nearingRetention}
              </td>
            </tr>
            <tr>
              <td>Retensi sudah lewat</td>
              <td data-testid="analytics-expired-retention">
                {data.documents.expiredRetention}
              </td>
            </tr>
            <tr>
              <td>Legal hold</td>
              <td data-testid="analytics-legal-hold">{data.documents.legalHold}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Tren Unggahan (6 bulan)</h3>
        {data.uploads.trend.length === 0 ? (
          <p className="empty">Belum ada data unggahan.</p>
        ) : (
          <table data-testid="analytics-upload-trend">
            <thead>
              <tr>
                <th>Bulan</th>
                <th>Jumlah unggahan</th>
              </tr>
            </thead>
            <tbody>
              {data.uploads.trend.map((point) => (
                <tr key={point.month} data-testid="analytics-upload-trend-row">
                  <td>{point.month}</td>
                  <td>{point.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ marginTop: 8 }}>
          {data.uploads.totalVersions} versi · {formatBytes(data.uploads.totalSizeBytes)} total
        </p>
      </div>

      <div className="card">
        <h3>Dokumen per Jenis</h3>
        {data.documentTypes.length === 0 ? (
          <p className="empty" data-testid="analytics-types-empty">
            Belum ada dokumen.
          </p>
        ) : (
          <table data-testid="analytics-document-types">
            <thead>
              <tr>
                <th>Jenis</th>
                <th>Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {data.documentTypes.map((type) => (
                <tr key={type.id ?? type.name} data-testid="analytics-type-row">
                  <td>{type.name}</td>
                  <td>{type.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Berbagi Metrik Lintas Sekolah</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Ikut serta dalam agregasi anonim untuk dashboard yayasan/dinas.
          Data yang dibagikan bersifat agregat tanpa identitas sekolah.
        </p>
        <p>
          Status:{' '}
          <strong data-testid="analytics-optin-status">
            {data.school.analyticsOptIn ? 'Aktif (opt-in)' : 'Tidak aktif'}
          </strong>
        </p>
        {canToggleOptIn ? (
          <button
            className="btn btn-primary"
            disabled={busy}
            data-testid="analytics-optin-toggle"
            onClick={() => void onToggleOptIn(!data.school.analyticsOptIn)}
          >
            {busy
              ? 'Menyimpan...'
              : data.school.analyticsOptIn
                ? 'Berhenti berbagi'
                : 'Ikut berbagi metrik'}
          </button>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Hanya kepala sekolah/kepala tata usaha yang dapat mengubah preferensi ini.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Riwayat Skor Kepatuhan</h3>
        {data.compliance.trend.length === 0 ? (
          <p className="empty" data-testid="analytics-trend-empty">
            Belum ada snapshot kepatuhan.
          </p>
        ) : (
          <table data-testid="analytics-compliance-history">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Skor</th>
              </tr>
            </thead>
            <tbody>
              {data.compliance.trend.map((point) => (
                <tr
                  key={point.computedAt}
                  data-testid="analytics-compliance-history-row"
                >
                  <td>{formatDate(point.computedAt)}</td>
                  <td>{point.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
