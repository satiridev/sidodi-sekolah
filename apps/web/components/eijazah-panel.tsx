'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type AcademicYear,
  type EijazahBatchDetail,
  type EijazahBatchSummary,
  type EijazahCertificateItem,
  type EijazahVerifyResult,
} from '../lib/api';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function statusBadge(status: string): string {
  if (status === 'issued') return 'badge-baik';
  if (status === 'revoked') return 'badge-perlu_perbaikan';
  return 'badge-cukup';
}

/**
 * Modul E-Ijazah: batch per tahun ajaran, generate sertifikat untuk semua siswa
 * terdaftar, penerbitan + tanda tangan elektronik, pencabutan, unduh PDF, serta
 * verifikasi publik berdasarkan nomor seri.
 */
export function EijazahPanel({ schoolId }: { schoolId: string }) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [batches, setBatches] = useState<EijazahBatchSummary[]>([]);
  const [batchId, setBatchId] = useState('');
  const [batch, setBatch] = useState<EijazahBatchDetail | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [verifySerial, setVerifySerial] = useState('');
  const [verifyResult, setVerifyResult] = useState<EijazahVerifyResult | null>(
    null,
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(errMessage(err, 'Terjadi kesalahan'));
    } finally {
      setBusy(false);
    }
  }

  const loadBatches = useCallback(async () => {
    const list = await api.eijazahBatches(schoolId);
    setBatches(list);
    return list;
  }, [schoolId]);

  const selectBatch = useCallback(async (id: string) => {
    setBatchId(id);
    setBatch(await api.eijazahBatch(id));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await api.eijazahBatches(schoolId);
        if (!active) return;
        setBatches(list);
        if (list[0]) {
          setBatchId(list[0].id);
          setBatch(await api.eijazahBatch(list[0].id));
        }
      } catch (err) {
        if (active) setError(errMessage(err, 'Gagal memuat data E-Ijazah'));
      }
    })();
    return () => {
      active = false;
    };
  }, [schoolId]);

  useEffect(() => {
    void api
      .academicYears(schoolId)
      .then((list) => {
        setYears(list);
        setYearId(list.find((y) => y.isActive)?.id ?? list[0]?.id ?? '');
      })
      .catch(() => setYears([]));
  }, [schoolId]);

  function onCreateBatch() {
    void run(async () => {
      if (!yearId) {
        setError('Pilih tahun ajaran terlebih dahulu.');
        return;
      }
      const created = await api.createEijazahBatch(schoolId, yearId);
      setNotice(`Batch ijazah tahun ajaran ${created.academicYear.name} siap.`);
      await loadBatches();
      await selectBatch(created.id);
    });
  }

  function onGenerate() {
    if (!batchId) return;
    void run(async () => {
      const result = await api.generateEijazah(batchId);
      setNotice(
        result.generated > 0
          ? `${result.generated} ijazah dibuat (status draf).`
          : 'Semua siswa pada tahun ajaran ini sudah memiliki ijazah.',
      );
      await selectBatch(batchId);
      await loadBatches();
    });
  }

  function onIssue(cert: EijazahCertificateItem) {
    void run(async () => {
      await api.issueEijazah(cert.id);
      setNotice(`Ijazah ${cert.serialNumber} diterbitkan.`);
      await selectBatch(batchId);
    });
  }

  function onRevoke(cert: EijazahCertificateItem) {
    void run(async () => {
      await api.revokeEijazah(cert.id);
      setNotice(`Ijazah ${cert.serialNumber} dicabut.`);
      await selectBatch(batchId);
    });
  }

  function onVerify(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      const serial = verifySerial.trim();
      if (!serial) {
        setError('Masukkan nomor seri ijazah.');
        return;
      }
      setVerifyResult(await api.verifyEijazah(serial));
    });
  }

  return (
    <div className="card" data-testid="eijazah-panel">
      <h3>E-Ijazah</h3>
      {error && (
        <div className="alert alert-error" data-testid="eijazah-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" data-testid="eijazah-notice">
          {notice}
        </div>
      )}

      <div className="form-row">
        <div className="field">
          <label htmlFor="eijazah-year">Tahun ajaran</label>
          <select
            id="eijazah-year"
            data-testid="eijazah-year"
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
          >
            <option value="">— pilih tahun ajaran —</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={onCreateBatch}
            disabled={busy}
            data-testid="create-eijazah-batch"
          >
            Buat / Pilih Batch
          </button>
        </div>
      </div>

      <h4>Batch Ijazah ({batches.length})</h4>
      {batches.length === 0 ? (
        <p className="empty" data-testid="eijazah-batch-empty">
          Belum ada batch ijazah.
        </p>
      ) : (
        <ul className="plain-list" data-testid="eijazah-batch-list">
          {batches.map((b) => (
            <li key={b.id} data-testid="eijazah-batch-item">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => void selectBatch(b.id)}
              >
                TA {b.academicYear.name} · {b._count?.certificates ?? 0} ijazah ·{' '}
                {b.status}
              </button>
            </li>
          ))}
        </ul>
      )}

      {batch && (
        <div data-testid="eijazah-batch-detail">
          <div className="actions" style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={onGenerate}
              disabled={busy}
              data-testid="generate-eijazah"
            >
              Generate Ijazah
            </button>
          </div>

          {batch.certificates.length === 0 ? (
            <p className="empty" data-testid="eijazah-certificate-empty">
              Belum ada sertifikat pada batch ini.
            </p>
          ) : (
            <table data-testid="eijazah-certificate-list">
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>Nomor Seri</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {batch.certificates.map((cert) => (
                  <tr key={cert.id} data-testid="eijazah-certificate-row">
                    <td>{cert.student.fullName}</td>
                    <td data-testid="eijazah-serial">{cert.serialNumber}</td>
                    <td>
                      <span className={`badge ${statusBadge(cert.status)}`}>
                        {cert.status}
                      </span>
                    </td>
                    <td>
                      {cert.status === 'draft' && (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={busy}
                          data-testid="issue-eijazah"
                          onClick={() => onIssue(cert)}
                        >
                          Terbitkan
                        </button>
                      )}
                      {cert.status === 'issued' && (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          disabled={busy}
                          data-testid="revoke-eijazah"
                          onClick={() => onRevoke(cert)}
                        >
                          Cabut
                        </button>
                      )}
                      <a
                        className="btn btn-ghost"
                        href={api.eijazahPdfUrl(cert.id)}
                        data-testid="download-eijazah"
                        style={{ marginLeft: 8 }}
                      >
                        Unduh
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <h4>Verifikasi Publik</h4>
      <form onSubmit={onVerify} className="form-row">
        <div className="field" style={{ flex: '1 1 260px' }}>
          <label htmlFor="eijazah-verify-serial">Nomor seri ijazah</label>
          <input
            id="eijazah-verify-serial"
            data-testid="verify-serial"
            value={verifySerial}
            onChange={(e) => setVerifySerial(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy}
            data-testid="verify-submit"
          >
            Verifikasi
          </button>
        </div>
      </form>
      {verifyResult && (
        <div className="alert" data-testid="verify-result">
          {verifyResult.valid ? (
            <strong>VALID</strong>
          ) : (
            <strong>TIDAK VALID</strong>
          )}{' '}
          — {verifyResult.serialNumber}
          {verifyResult.found ? (
            <>
              {' '}
              · {verifyResult.studentName} · {verifyResult.schoolName} · status:{' '}
              {verifyResult.status}
            </>
          ) : (
            ' · nomor seri tidak ditemukan'
          )}
        </div>
      )}
    </div>
  );
}
