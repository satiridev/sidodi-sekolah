'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type AcademicYear,
  type DocumentItem,
  type FinanceArchiveItem,
  type FinanceCategoryValue,
  type FinanceSummary,
} from '../lib/api';

const CATEGORIES: Array<{ value: FinanceCategoryValue; label: string }> = [
  { value: 'RKAS', label: 'RKAS (Rencana Kegiatan & Anggaran)' },
  { value: 'SPJ', label: 'SPJ (Surat Pertanggungjawaban)' },
  { value: 'KUITANSI', label: 'Kuitansi' },
  { value: 'LAPORAN_BOS', label: 'Laporan BOS' },
  { value: 'BUKU_KAS', label: 'Buku Kas' },
  { value: 'PAJAK', label: 'Pajak' },
  { value: 'LAINNYA', label: 'Lainnya' },
];

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatIdr(value: string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Modul Arsip Keuangan/BOS: pencatatan arsip keuangan, ringkasan per tahun
 * ajaran, dan ekspor paket audit (ZIP + manifest).
 */
export function FinancePanel({ schoolId }: { schoolId: string }) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [archives, setArchives] = useState<FinanceArchiveItem[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [yearFilter, setYearFilter] = useState('');

  const [category, setCategory] = useState<FinanceCategoryValue>('RKAS');
  const [academicYearId, setAcademicYearId] = useState('');
  const [amountIdr, setAmountIdr] = useState('');
  const [documentId, setDocumentId] = useState('');

  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sortedArchives = useMemo(
    () =>
      [...archives].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [archives],
  );

  const loadData = useCallback(
    async (filterYear: string) => {
      const [list, sum] = await Promise.all([
        api.financeArchives(schoolId, {
          academicYearId: filterYear || undefined,
        }),
        api.financeSummary(schoolId, filterYear || undefined),
      ]);
      setArchives(list);
      setSummary(sum);
    },
    [schoolId],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [yearList, docs] = await Promise.all([
          api.academicYears(schoolId),
          api.documents(schoolId),
        ]);
        if (!active) return;
        setYears(yearList);
        setDocuments(docs.items);
        await loadData('');
      } catch (err) {
        if (active) setError(errMessage(err, 'Gagal memuat data keuangan'));
      }
    })();
    return () => {
      active = false;
    };
  }, [schoolId, loadData]);

  async function onFilterChange(value: string) {
    setYearFilter(value);
    setError(null);
    try {
      await loadData(value);
    } catch (err) {
      setError(errMessage(err, 'Gagal memuat data keuangan'));
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.createFinanceArchive(schoolId, {
        category,
        academicYearId: academicYearId || undefined,
        amountIdr: amountIdr ? Number(amountIdr) : undefined,
        documentId: documentId || undefined,
      });
      setNotice('Arsip keuangan berhasil dicatat.');
      setAmountIdr('');
      setDocumentId('');
      if (yearFilter) setYearFilter('');
      await loadData('');
    } catch (err) {
      setError(errMessage(err, 'Gagal mencatat arsip keuangan'));
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await api.financeExport(schoolId, yearFilter || undefined);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `paket-audit-${schoolId.slice(0, 8)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice('Paket audit diunduh.');
    } catch (err) {
      setError(errMessage(err, 'Gagal mengekspor paket audit'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div data-testid="finance-panel">
      {error && (
        <div className="alert alert-error" data-testid="finance-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" data-testid="finance-notice">
          {notice}
        </div>
      )}

      <div className="card">
        <h3>Ringkasan Keuangan</h3>
        <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
          <div className="field">
            <label htmlFor="finance-filter-year">Tahun ajaran</label>
            <select
              id="finance-filter-year"
              data-testid="finance-filter-year"
              value={yearFilter}
              onChange={(e) => void onFilterChange(e.target.value)}
            >
              <option value="">Semua tahun ajaran</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <h3>Jumlah Arsip</h3>
            <div className="score" data-testid="finance-total-count">
              {summary?.totalCount ?? 0}
            </div>
          </div>
          <div className="card">
            <h3>Total Nominal</h3>
            <div className="score" data-testid="finance-total-amount">
              {formatIdr(summary?.totalAmountIdr)}
            </div>
          </div>
        </div>

        {summary && summary.byCategory.length > 0 && (
          <table data-testid="finance-summary">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Jumlah</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.byCategory.map((row) => (
                <tr key={row.category} data-testid="finance-summary-row">
                  <td>{categoryLabel(row.category)}</td>
                  <td>{row.count}</td>
                  <td>{formatIdr(row.totalAmountIdr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {summary && summary.byAcademicYear.length > 0 && (
          <>
            <h4 style={{ marginBottom: 8 }}>Per Tahun Ajaran</h4>
            <table data-testid="finance-summary-year">
              <thead>
                <tr>
                  <th>Tahun Ajaran</th>
                  <th>Jumlah</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.byAcademicYear.map((row) => (
                  <tr
                    key={row.academicYearId ?? 'tanpa-ta'}
                    data-testid="finance-summary-year-row"
                  >
                    <td>{row.academicYearName ?? 'Tanpa tahun ajaran'}</td>
                    <td>{row.count}</td>
                    <td>{formatIdr(row.totalAmountIdr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <h3>Catat Arsip Keuangan</h3>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="finance-category">Kategori</label>
              <select
                id="finance-category"
                data-testid="finance-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as FinanceCategoryValue)
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="finance-year">Tahun ajaran (opsional)</label>
              <select
                id="finance-year"
                data-testid="finance-year"
                value={academicYearId}
                onChange={(e) => setAcademicYearId(e.target.value)}
              >
                <option value="">— tidak ditentukan —</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="finance-amount">Nominal (IDR, opsional)</label>
              <input
                id="finance-amount"
                data-testid="finance-amount"
                type="number"
                min={0}
                step={1}
                value={amountIdr}
                onChange={(e) => setAmountIdr(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="finance-document">Dokumen tertaut (opsional)</label>
              <select
                id="finance-document"
                data-testid="finance-document"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
              >
                <option value="">— tanpa dokumen —</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy}
            data-testid="finance-submit"
          >
            {busy ? 'Menyimpan...' : 'Simpan Arsip'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
          <h3 style={{ flex: '1 1 auto', margin: 0 }}>Arsip Keuangan</h3>
          <button
            className="btn btn-ghost"
            onClick={() => void onExport()}
            disabled={exporting}
            data-testid="finance-export"
          >
            {exporting ? 'Menyiapkan...' : 'Ekspor Paket Audit (ZIP)'}
          </button>
        </div>
        {sortedArchives.length === 0 ? (
          <p className="empty" data-testid="finance-empty">
            Belum ada arsip keuangan.
          </p>
        ) : (
          <table data-testid="finance-list">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Tahun Ajaran</th>
                <th>Nominal</th>
                <th>Dokumen</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {sortedArchives.map((archive) => (
                <tr key={archive.id} data-testid="finance-row">
                  <td>{categoryLabel(archive.category)}</td>
                  <td>{archive.academicYear?.name ?? '-'}</td>
                  <td>{archive.amountIdr ? formatIdr(archive.amountIdr) : '-'}</td>
                  <td>{archive.document?.title ?? '-'}</td>
                  <td>{new Date(archive.createdAt).toLocaleDateString('id-ID')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
