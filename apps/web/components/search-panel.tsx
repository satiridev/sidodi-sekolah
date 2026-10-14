'use client';

import { useCallback, useState } from 'react';
import {
  api,
  ApiError,
  type SearchHit,
  type SearchResult,
} from '../lib/api';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatBytes(value: string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function ocrBadgeClass(status: string | null | undefined): string {
  if (status === 'done') return 'badge badge-baik';
  if (status === 'failed') return 'badge badge-buruk';
  if (status === 'skipped') return 'badge badge-waspada';
  return 'badge';
}

/**
 * Modul OCR & Pencarian (§4.3): pencarian full-text ber-facet (PostgreSQL
 * `tsvector`), pemrosesan OCR tertunda, dan pratinjau teks hasil ekstraksi.
 *
 * Backend: `GET /schools/:id/search`, `POST /schools/:id/ocr/run`,
 * `GET /documents/:id/extracted-text`.
 */
export function SearchPanel({ schoolId }: { schoolId: string }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [year, setYear] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [extracted, setExtracted] = useState<{
    hit: SearchHit;
    text: string;
  } | null>(null);

  const runSearch = useCallback(
    async (overrides?: {
      q?: string;
      type?: string;
      year?: string;
      tags?: string[];
    }) => {
      const query = overrides?.q ?? q;
      if (!query.trim()) {
        setError('Kata kunci pencarian wajib diisi.');
        return;
      }
      const nextType = overrides?.type ?? type;
      const nextYear = overrides?.year ?? year;
      const nextTags = overrides?.tags ?? tags;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const data = await api.search(schoolId, {
          q: query.trim(),
          type: nextType || undefined,
          year: nextYear || undefined,
          tags: nextTags.length ? nextTags.join(',') : undefined,
          limit: 50,
        });
        setResult(data);
      } catch (err) {
        setError(errMessage(err, 'Gagal menjalankan pencarian'));
      } finally {
        setBusy(false);
      }
    },
    [q, type, year, tags, schoolId],
  );

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void runSearch();
  }

  function reset() {
    setQ('');
    setType('');
    setYear('');
    setTags([]);
    setResult(null);
    setExtracted(null);
    setError(null);
    setNotice(null);
  }

  async function runOcr() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.runOcr(schoolId);
      setNotice(`${res.processed} pekerjaan OCR diproses.`);
    } catch (err) {
      setError(errMessage(err, 'Gagal menjalankan OCR'));
    } finally {
      setBusy(false);
    }
  }

  async function loadText(hit: SearchHit) {
    setError(null);
    try {
      const text = await api.extractedText(hit.id);
      setExtracted({ hit, text: text.text });
    } catch (err) {
      setError(errMessage(err, 'Gagal memuat teks'));
    }
  }

  const facets = result?.facets;

  return (
    <div className="card" data-testid="search-panel">
      <h3>OCR &amp; Pencarian</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Pencarian full-text ke judul, deskripsi, nama berkas, dan hasil OCR.
        Proses OCR tertunda terlebih dahulu agar isi dokumen dapat dicari.
      </p>

      {error && (
        <div className="alert alert-error" data-testid="search-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" data-testid="search-ocr-notice">
          {notice}
        </div>
      )}

      <form onSubmit={onSubmit} className="form-row">
        <div className="field" style={{ flex: '1 1 360px' }}>
          <label htmlFor="search-q">Kata kunci</label>
          <input
            id="search-q"
            data-testid="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="mis. anggaran, notulen, BOS"
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
            data-testid="search-submit"
          >
            Cari
          </button>
        </div>
        <div
          className="field"
          style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
        >
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            data-testid="search-ocr-run"
            onClick={() => void runOcr()}
          >
            Jalankan OCR
          </button>
        </div>
        <div
          className="field"
          style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
        >
          <button
            className="btn btn-ghost"
            type="button"
            data-testid="search-reset"
            onClick={reset}
          >
            Reset
          </button>
        </div>
      </form>

      {(type || year || tags.length > 0) && (
        <div className="filters" data-testid="search-active-filters">
          {type && (
            <span className="chip" data-testid="search-active-type">
              jenis: {type}
              <button type="button" onClick={() => { setType(''); void runSearch({ type: '' }); }}>
                ×
              </button>
            </span>
          )}
          {year && (
            <span className="chip" data-testid="search-active-year">
              tahun: {year}
              <button type="button" onClick={() => { setYear(''); void runSearch({ year: '' }); }}>
                ×
              </button>
            </span>
          )}
          {tags.map((t) => (
            <span className="chip" key={t} data-testid="search-active-tag">
              #{t}
              <button
                type="button"
                onClick={() => {
                  const next = tags.filter((x) => x !== t);
                  setTags(next);
                  void runSearch({ tags: next });
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {result && (
        <>
          <p data-testid="search-total">
            {result.total} dokumen ditemukan untuk “{q}”.
          </p>

          {facets && (
            <div className="facets" data-testid="search-facets">
              {facets.documentType.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="btn btn-ghost"
                  data-testid="search-facet-type"
                  onClick={() => {
                    const next = type === f.id ? '' : f.id;
                    setType(next);
                    void runSearch({ type: next });
                  }}
                >
                  {f.name ?? 'Tanpa jenis'} ({f.count})
                </button>
              ))}
              {facets.academicYear.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="btn btn-ghost"
                  data-testid="search-facet-year"
                  onClick={() => {
                    const next = year === f.id ? '' : f.id;
                    setYear(next);
                    void runSearch({ year: next });
                  }}
                >
                  {f.id.slice(0, 8)} ({f.count})
                </button>
              ))}
              {facets.tags.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className="btn btn-ghost"
                  data-testid="search-facet-tag"
                  onClick={() => {
                    const next = tags.includes(f.value)
                      ? tags.filter((t) => t !== f.value)
                      : [...tags, f.value];
                    setTags(next);
                    void runSearch({ tags: next });
                  }}
                >
                  #{f.value} ({f.count})
                </button>
              ))}
            </div>
          )}

          {result.data.length === 0 ? (
            <p className="empty" data-testid="search-empty">
              Tidak ada dokumen yang cocok.
            </p>
          ) : (
            <ul className="search-results" data-testid="search-results">
              {result.data.map((hit) => (
                <li key={hit.id} data-testid="search-result">
                  <div className="search-result-head">
                    <strong data-testid="search-result-title">
                      {hit.title}
                    </strong>
                    <span
                      className={ocrBadgeClass(hit.ocrStatus)}
                      data-testid="search-result-ocr"
                    >
                      OCR: {hit.ocrStatus ?? 'pending'}
                    </span>
                  </div>
                  {hit.excerpt && (
                    <p
                      className="muted"
                      data-testid="search-excerpt"
                      style={{ margin: '4px 0' }}
                    >
                      …{hit.excerpt}…
                    </p>
                  )}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {hit.documentTypeName ?? 'Tanpa jenis'} ·{' '}
                    {hit.fileName ?? 'tanpa berkas'} ·{' '}
                    {formatBytes(hit.sizeBytes)}
                  </div>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    style={{ marginTop: 6 }}
                    data-testid="search-load-text"
                    onClick={() => void loadText(hit)}
                  >
                    Lihat teks
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {extracted && (
        <div className="card" style={{ marginTop: 12, background: '#f8fafc' }}>
          <div className="search-result-head">
            <strong>Teks hasil OCR: {extracted.hit.title}</strong>
            <button
              className="btn btn-ghost"
              type="button"
              data-testid="search-text-close"
              onClick={() => setExtracted(null)}
            >
              Tutup
            </button>
          </div>
          {extracted.text ? (
            <pre
              data-testid="search-extracted-text"
              style={{ whiteSpace: 'pre-wrap', margin: 0 }}
            >
              {extracted.text}
            </pre>
          ) : (
            <p className="empty" data-testid="search-extracted-empty">
              Tidak ada teks terekstraksi.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
