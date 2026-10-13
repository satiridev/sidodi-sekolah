'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type DocumentItem,
  type DocumentVersionItem,
  type VersionCompareResult,
} from '../lib/api';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatBytes(value: string | number | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('id-ID');
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}

/**
 * Modul Versioning Dokumen: riwayat versi, unduh versi lama, bandingkan, dan
 * pulihkan versi (menjadi versi baru). Versi otomatis bertambah saat berkas
 * baru diunggah ke dokumen yang sama (lihat modul Uploads).
 *
 * Daftar dokumen diterima dari halaman induk agar tetap sinkron setelah
 * pengunggahan tanpa perlu memuat ulang.
 */
export function VersionPanel({ documents }: { documents: DocumentItem[] }) {
  const [documentId, setDocumentId] = useState('');
  const [versions, setVersions] = useState<DocumentVersionItem[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [restoreTarget, setRestoreTarget] = useState<DocumentVersionItem | null>(
    null,
  );
  const [restoreNote, setRestoreNote] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [comparison, setComparison] = useState<VersionCompareResult | null>(null);

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

  const loadVersions = useCallback(async (docId: string) => {
    const list = await api.versions(docId);
    setVersions(list);
    setFromId(list[1]?.id ?? list[0]?.id ?? '');
    setToId(list[0]?.id ?? '');
    setComparison(null);
  }, []);

  // Sinkronkan pilihan dokumen dengan daftar dari halaman induk.
  useEffect(() => {
    setDocumentId((prev) =>
      prev && documents.some((d) => d.id === prev)
        ? prev
        : documents[0]?.id ?? '',
    );
  }, [documents]);

  // Muat versi saat dokumen terpilih berubah.
  useEffect(() => {
    if (!documentId) {
      setVersions([]);
      return;
    }
    let active = true;
    void api
      .versions(documentId)
      .then((list) => {
        if (!active) return;
        setVersions(list);
        setFromId(list[1]?.id ?? list[0]?.id ?? '');
        setToId(list[0]?.id ?? '');
        setComparison(null);
      })
      .catch((err) => {
        if (active) setError(errMessage(err, 'Gagal memuat riwayat versi'));
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  function onRestore(event: React.FormEvent) {
    event.preventDefault();
    if (!restoreTarget || !documentId) return;
    void (async () => {
      setBusy(true);
      setRestoreError(null);
      try {
        const created = await api.restoreVersion(
          documentId,
          restoreTarget.id,
          restoreNote || undefined,
        );
        const fromNumber = restoreTarget.versionNumber;
        setRestoreTarget(null);
        setRestoreNote('');
        await loadVersions(documentId);
        setNotice(
          `Versi ${created.versionNumber} dibuat dari pemulihan versi ${fromNumber}.`,
        );
      } catch (err) {
        setRestoreError(errMessage(err, 'Gagal memulihkan versi'));
      } finally {
        setBusy(false);
      }
    })();
  }

  function onCompare(event: React.FormEvent) {
    event.preventDefault();
    if (!documentId) return;
    if (!fromId || !toId) {
      setError('Pilih dua versi untuk dibandingkan.');
      return;
    }
    void run(async () => {
      setComparison(await api.compareVersions(documentId, fromId, toId));
    });
  }

  return (
    <div className="card" data-testid="version-panel">
      <h3>Versioning Dokumen</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Setiap unggahan baru ke dokumen yang sama menaikkan nomor versi. Versi
        lama dapat diunduh, dibandingkan, atau dipulihkan menjadi versi baru.
      </p>

      {error && (
        <div className="alert alert-error" data-testid="version-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" data-testid="version-notice">
          {notice}
        </div>
      )}

      {documents.length === 0 ? (
        <p className="empty" data-testid="version-no-document">
          Belum ada dokumen untuk diberi versi.
        </p>
      ) : (
        <div className="form-row">
          <div className="field" style={{ flex: '1 1 320px' }}>
            <label htmlFor="version-document">Dokumen</label>
            <select
              id="version-document"
              data-testid="version-document-select"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {documentId && versions.length === 0 && (
        <p className="empty" data-testid="version-empty">
          Dokumen ini belum memiliki berkas/versi.
        </p>
      )}

      {versions.length > 0 && (
        <table data-testid="version-list">
          <thead>
            <tr>
              <th>Versi</th>
              <th>Berkas</th>
              <th>Ukuran</th>
              <th>Catatan perubahan</th>
              <th>Pengunggah</th>
              <th>Waktu</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} data-testid="version-row">
                <td>
                  <span data-testid="version-number">{v.versionNumber}</span>
                  {toId === v.id && (
                    <span className="badge badge-baik" style={{ marginLeft: 8 }}>
                      terkini
                    </span>
                  )}
                </td>
                <td>{v.fileName}</td>
                <td>{formatBytes(v.sizeBytes)}</td>
                <td>{v.changeNote ?? '-'}</td>
                <td>{v.uploadedBy?.name ?? '-'}</td>
                <td>{formatDateTime(v.createdAt)}</td>
                <td>
                  <a
                    className="btn btn-ghost"
                    data-testid="version-download"
                    href={api.versionDownloadUrl(documentId, v.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Unduh
                  </a>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    style={{ marginLeft: 8 }}
                    data-testid="version-restore"
                    onClick={() => {
                      setRestoreTarget(v);
                      setRestoreNote('');
                      setRestoreError(null);
                    }}
                  >
                    Pulihkan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {restoreTarget && (
        <form
          onSubmit={onRestore}
          className="form-row"
          style={{ marginTop: 12 }}
          data-testid="version-restore-form"
        >
          <div className="field" style={{ flex: '1 1 320px' }}>
            <label htmlFor="version-restore-note">
              Catatan perubahan (versi {restoreTarget.versionNumber})
            </label>
            <input
              id="version-restore-note"
              data-testid="version-restore-note"
              value={restoreNote}
              onChange={(e) => setRestoreNote(e.target.value)}
              placeholder={`Dipulihkan dari versi ${restoreTarget.versionNumber}`}
              maxLength={500}
            />
          </div>
          <div
            className="field"
            style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
          >
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy}
              data-testid="version-restore-confirm"
            >
              {busy ? 'Memulihkan...' : 'Pulihkan'}
            </button>
          </div>
          <div
            className="field"
            style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
          >
            <button
              className="btn btn-ghost"
              type="button"
              data-testid="version-restore-cancel"
              onClick={() => setRestoreTarget(null)}
            >
              Batal
            </button>
          </div>
          {restoreError && (
            <div
              className="alert alert-error"
              style={{ flexBasis: '100%' }}
              data-testid="version-restore-error"
            >
              {restoreError}
            </div>
          )}
        </form>
      )}

      {versions.length > 1 && (
        <form
          onSubmit={onCompare}
          style={{ marginTop: 16 }}
          data-testid="version-compare-form"
        >
          <h4>Bandingkan Versi</h4>
          <div className="form-row">
            <div className="field">
              <label htmlFor="version-compare-from">Dari</label>
              <select
                id="version-compare-from"
                data-testid="version-compare-from"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Versi {v.versionNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="version-compare-to">Ke</label>
              <select
                id="version-compare-to"
                data-testid="version-compare-to"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Versi {v.versionNumber}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="field"
              style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
            >
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy}
                data-testid="version-compare-submit"
              >
                Bandingkan
              </button>
            </div>
          </div>
        </form>
      )}

      {comparison && (
        <div data-testid="version-compare-result">
          <p style={{ marginBottom: 8 }}>
            Versi {comparison.from.versionNumber} → Versi{' '}
            {comparison.to.versionNumber}:{' '}
            <strong>{comparison.contentChanged ? 'konten berbeda' : 'konten sama'}</strong>
            {' '}(Δ {formatBytes(comparison.sizeDeltaBytes.replace('-', ''))}
            {comparison.sizeDeltaBytes.startsWith('-') ? ' lebih kecil' : ' lebih besar'})
          </p>
          {comparison.metadataChanges.length === 0 ? (
            <p className="muted" data-testid="version-compare-identical">
              Tidak ada perbedaan metadata.
            </p>
          ) : (
            <table data-testid="version-compare-changes">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Dari</th>
                  <th>Ke</th>
                </tr>
              </thead>
              <tbody>
                {comparison.metadataChanges.map((c) => (
                  <tr key={c.field} data-testid="version-compare-change">
                    <td>{c.field}</td>
                    <td>{c.field === 'contentHash' ? shortHash(c.from) : c.from}</td>
                    <td>{c.field === 'contentHash' ? shortHash(c.to) : c.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
