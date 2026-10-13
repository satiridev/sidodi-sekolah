'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type AcademicYear,
  type Classroom,
  type Semester,
} from '../lib/api';

function toIsoDate(value: string): string {
  // <input type="date"> memberi YYYY-MM-DD; normalisasi ke ISO 8601.
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('id-ID');
}

/**
 * Kelola struktur akademik: tahun ajaran, semester, dan kelas. Struktur ini
 * menjadi dasar generator folder otomatis (TA > Semester > Kelas > Jenis).
 */
export function AcademicPanel({ schoolId }: { schoolId: string }) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Form tahun ajaran
  const [yearName, setYearName] = useState('2025/2026');
  const [yearStart, setYearStart] = useState('2025-07-01');
  const [yearEnd, setYearEnd] = useState('2026-06-30');
  const [yearActive, setYearActive] = useState(true);

  // Form semester
  const [semName, setSemName] = useState('Ganjil');
  const [semTerm, setSemTerm] = useState<'odd' | 'even'>('odd');

  // Form kelas
  const [clsName, setClsName] = useState('7A');
  const [clsGrade, setClsGrade] = useState(7);

  const selectedYear = years.find((y) => y.id === selectedYearId) ?? null;

  const loadYears = useCallback(async () => {
    const list = await api.academicYears(schoolId);
    setYears(list);
    setSelectedYearId((prev) => {
      if (prev && list.some((y) => y.id === prev)) return prev;
      return list.find((y) => y.isActive)?.id ?? list[0]?.id ?? '';
    });
  }, [schoolId]);

  useEffect(() => {
    void loadYears().catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat tahun ajaran');
    });
  }, [loadYears]);

  useEffect(() => {
    if (!selectedYearId) {
      setSemesters([]);
      setClassrooms([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const [sems, classes] = await Promise.all([
          api.semesters(selectedYearId),
          api.classrooms(schoolId, selectedYearId),
        ]);
        if (!active) return;
        setSemesters(sems);
        setClassrooms(classes);
      } catch (err) {
        if (active) {
          setError(err instanceof ApiError ? err.message : 'Gagal memuat semester/kelas');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedYearId, schoolId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Terjadi kesalahan');
    } finally {
      setBusy(false);
    }
  }

  function onCreateYear(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      const created = await api.createAcademicYear(schoolId, {
        name: yearName,
        startDate: toIsoDate(yearStart),
        endDate: toIsoDate(yearEnd),
        isActive: yearActive,
      });
      setSelectedYearId(created.id);
      await loadYears();
      setNotice(`Tahun ajaran ${created.name} dibuat.`);
    });
  }

  function onActivateYear() {
    if (!selectedYearId) return;
    void run(async () => {
      const active = await api.activateAcademicYear(selectedYearId);
      await loadYears();
      setNotice(`Tahun ajaran ${active.name} diaktifkan.`);
    });
  }

  function onCreateSemester(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedYearId) return;
    void run(async () => {
      await api.createSemester(selectedYearId, { name: semName, term: semTerm });
      setSemesters(await api.semesters(selectedYearId));
      setNotice(`Semester ${semName} dibuat.`);
    });
  }

  function onCreateClassroom(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedYearId) return;
    void run(async () => {
      await api.createClassroom(schoolId, {
        name: clsName,
        gradeLevel: clsGrade,
        academicYearId: selectedYearId,
      });
      setClassrooms(await api.classrooms(schoolId, selectedYearId));
      setNotice(`Kelas ${clsName} dibuat.`);
    });
  }

  return (
    <div className="card" data-testid="academic-panel">
      <h3>Tahun Ajaran, Semester &amp; Kelas</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Buat tahun ajaran (jadikan aktif) sebelum membuat semester/kelas dan
        generate struktur folder.
      </p>

      {error && (
        <div className="alert alert-error" data-testid="academic-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" data-testid="academic-notice">
          {notice}
        </div>
      )}

      <form onSubmit={onCreateYear}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="year-name">Tahun ajaran</label>
            <input
              id="year-name"
              data-testid="academic-year-name"
              value={yearName}
              onChange={(e) => setYearName(e.target.value)}
              required
              minLength={4}
            />
          </div>
          <div className="field">
            <label htmlFor="year-start">Mulai</label>
            <input
              id="year-start"
              type="date"
              data-testid="academic-year-start"
              value={yearStart}
              onChange={(e) => setYearStart(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="year-end">Selesai</label>
            <input
              id="year-end"
              type="date"
              data-testid="academic-year-end"
              value={yearEnd}
              onChange={(e) => setYearEnd(e.target.value)}
              required
            />
          </div>
          <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
            <label htmlFor="year-active">Aktif?</label>
            <input
              id="year-active"
              type="checkbox"
              data-testid="academic-year-active"
              checked={yearActive}
              onChange={(e) => setYearActive(e.target.checked)}
            />
          </div>
          <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy}
              data-testid="create-academic-year"
            >
              Tambah Tahun Ajaran
            </button>
          </div>
        </div>
      </form>

      {years.length > 0 && (
        <div className="form-row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <div className="field">
            <label htmlFor="year-select">Pilih tahun ajaran</label>
            <select
              id="year-select"
              data-testid="academic-year-select"
              value={selectedYearId}
              onChange={(e) => setSelectedYearId(e.target.value)}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.isActive ? ' (aktif)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={onActivateYear}
              disabled={busy || selectedYear?.isActive}
              data-testid="activate-year"
            >
              {selectedYear?.isActive ? 'Sudah aktif' : 'Aktifkan'}
            </button>
          </div>
        </div>
      )}

      {years.length > 0 && (
        <ul className="plain-list" data-testid="academic-year-list">
          {years.map((y) => (
            <li key={y.id} data-testid="academic-year-item">
              <strong>{y.name}</strong>{' '}
              <span className="muted">
                {formatDate(y.startDate)} – {formatDate(y.endDate)}
              </span>{' '}
              {y.isActive && <span className="badge badge-baik">aktif</span>}
            </li>
          ))}
        </ul>
      )}

      {selectedYear && (
        <div className="grid" style={{ marginTop: 16 }}>
          <div>
            <h4>Semester ({semesters.length})</h4>
            <form onSubmit={onCreateSemester}>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="sem-name">Nama semester</label>
                  <input
                    id="sem-name"
                    data-testid="semester-name"
                    value={semName}
                    onChange={(e) => setSemName(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="sem-term">Term</label>
                  <select
                    id="sem-term"
                    data-testid="semester-term"
                    value={semTerm}
                    onChange={(e) => setSemTerm(e.target.value as 'odd' | 'even')}
                  >
                    <option value="odd">Ganjil</option>
                    <option value="even">Genap</option>
                  </select>
                </div>
                <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={busy}
                    data-testid="create-semester"
                  >
                    Tambah Semester
                  </button>
                </div>
              </div>
            </form>
            {semesters.length === 0 ? (
              <p className="empty">Belum ada semester.</p>
            ) : (
              <ul className="plain-list" data-testid="semester-list">
                {semesters.map((s) => (
                  <li key={s.id} data-testid="semester-item">
                    {s.name}{' '}
                    <span className="muted">({s.term === 'odd' ? 'Ganjil' : 'Genap'})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4>Kelas ({classrooms.length})</h4>
            <form onSubmit={onCreateClassroom}>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="cls-name">Nama kelas</label>
                  <input
                    id="cls-name"
                    data-testid="classroom-name"
                    value={clsName}
                    onChange={(e) => setClsName(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="cls-grade">Tingkat</label>
                  <input
                    id="cls-grade"
                    type="number"
                    min={1}
                    max={12}
                    data-testid="classroom-grade"
                    value={clsGrade}
                    onChange={(e) => setClsGrade(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={busy}
                    data-testid="create-classroom"
                  >
                    Tambah Kelas
                  </button>
                </div>
              </div>
            </form>
            {classrooms.length === 0 ? (
              <p className="empty">Belum ada kelas.</p>
            ) : (
              <ul className="plain-list" data-testid="classroom-list">
                {classrooms.map((c) => (
                  <li key={c.id} data-testid="classroom-item">
                    {c.name} <span className="muted">tingkat {c.gradeLevel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
