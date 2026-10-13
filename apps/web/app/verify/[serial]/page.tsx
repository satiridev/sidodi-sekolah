'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, type EijazahVerifyResult } from '../../../lib/api';

/**
 * Halaman verifikasi publik ijazah (`/verify/:serial`). Tidak memerlukan login;
 * memanggil endpoint publik `/api/v1/verify/:serial`.
 */
export default function VerifyPage() {
  const params = useParams<{ serial: string }>();
  const serial = params.serial;
  const [result, setResult] = useState<EijazahVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serial) return;
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .verifyEijazah(serial)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError ? err.message : 'Gagal memverifikasi ijazah',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serial]);

  return (
    <main className="container" data-testid="verify-page">
      <header className="topbar">
        <Link className="brand" href="/">
          ← Arsip Digital Sekolah
        </Link>
      </header>

      <div className="card">
        <h3>Verifikasi Ijazah</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Nomor seri: <strong>{serial}</strong>
        </p>

        {loading && <p className="muted">Memeriksa...</p>}
        {error && (
          <div className="alert alert-error" data-testid="verify-error">
            {error}
          </div>
        )}

        {!loading && result && (
          <div
            className="alert"
            data-testid="verify-status"
            data-valid={result.valid ? 'true' : 'false'}
          >
            <p style={{ margin: 0, fontSize: 18 }}>
              {result.valid ? '✅ Ijazah VALID' : '❌ Ijazah TIDAK VALID'}
            </p>
            {result.found ? (
              <ul className="plain-list">
                <li>Nama: {result.studentName}</li>
                <li>Sekolah: {result.schoolName}</li>
                <li>Status: {result.status}</li>
                <li>
                  Diterbitkan:{' '}
                  {result.issuedAt
                    ? new Date(result.issuedAt).toLocaleDateString('id-ID')
                    : '-'}
                </li>
                {result.revokedAt && (
                  <li>
                    Dicabut:{' '}
                    {new Date(result.revokedAt).toLocaleDateString('id-ID')}
                  </li>
                )}
              </ul>
            ) : (
              <p style={{ margin: '8px 0 0' }}>
                Nomor seri tidak ditemukan dalam basis data.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
