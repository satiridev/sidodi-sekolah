'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type AcademicTermValue,
  type AcademicYear,
  type Classroom,
  type ClassroomStudentLink,
  type ImportResult,
  type ReportCardItem,
  type Semester,
  type Student,
  type Subject,
} from '../lib/api';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Modul E-Raport: data induk siswa, mata pelajaran, penugasan kelas, entri
 * nilai, dan pembuatan raport PDF per kelas. Modul mandiri (self-contained)
 * dan memakai struktur akademik (tahun ajaran, semester, kelas) yang sudah ada.
 */
export function ERaportPanel({ schoolId }: { schoolId: string }) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState('');
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);

  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Data siswa
  const [studentName, setStudentName] = useState('');
  const [studentNisn, setStudentNisn] = useState('');
  const [studentGender, setStudentGender] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mata pelajaran
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');

  // Penugasan kelas
  const [assignClassroomId, setAssignClassroomId] = useState('');
  const [assignSelection, setAssignSelection] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<ClassroomStudentLink[]>([]);

  // Entri nilai
  const [gradeClassroomId, setGradeClassroomId] = useState('');
  const [gradeSubjectId, setGradeSubjectId] = useState('');
  const [gradeTerm, setGradeTerm] = useState<AcademicTermValue>('odd');
  const [gradeStudents, setGradeStudents] = useState<ClassroomStudentLink[]>([]);
  const [gradeInputs, setGradeInputs] = useState<Record<string, string>>({});

  // Raport
  const [rcClassroomId, setRcClassroomId] = useState('');
  const [rcSemesterId, setRcSemesterId] = useState('');
  const [reportCards, setReportCards] = useState<ReportCardItem[]>([]);

  const selectedClassroom = (id: string) =>
    classrooms.find((c) => c.id === id) ?? null;

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

  const loadStudents = useCallback(async () => {
    setStudents(await api.students(schoolId));
  }, [schoolId]);

  const loadSubjects = useCallback(async () => {
    setSubjects(await api.subjects(schoolId));
  }, [schoolId]);

  // Muat data awal.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [yearList, studentList, subjectList] = await Promise.all([
          api.academicYears(schoolId),
          api.students(schoolId),
          api.subjects(schoolId),
        ]);
        if (!active) return;
        setYears(yearList);
        setStudents(studentList);
        setSubjects(subjectList);
        setYearId(
          yearList.find((y) => y.isActive)?.id ?? yearList[0]?.id ?? '',
        );
      } catch (err) {
        if (active) setError(errMessage(err, 'Gagal memuat data E-Raport'));
      }
    })();
    return () => {
      active = false;
    };
  }, [schoolId]);

  // Muat semester & kelas saat tahun ajaran berubah.
  useEffect(() => {
    if (!yearId) {
      setSemesters([]);
      setClassrooms([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const [semList, classList] = await Promise.all([
          api.semesters(yearId),
          api.classrooms(schoolId, yearId),
        ]);
        if (!active) return;
        setSemesters(semList);
        setClassrooms(classList);
        const pick = (prev: string) =>
          prev && classList.some((c) => c.id === prev)
            ? prev
            : classList[0]?.id ?? '';
        setAssignClassroomId((prev) => pick(prev));
        setGradeClassroomId((prev) => pick(prev));
        setRcClassroomId((prev) => pick(prev));
        setRcSemesterId((prev) =>
          prev && semList.some((s) => s.id === prev)
            ? prev
            : semList[0]?.id ?? '',
        );
      } catch (err) {
        if (active) setError(errMessage(err, 'Gagal memuat semester/kelas'));
      }
    })();
    return () => {
      active = false;
    };
  }, [yearId, schoolId]);

  // Siswa terdaftar di kelas penugasan.
  useEffect(() => {
    if (!assignClassroomId) {
      setAssigned([]);
      return;
    }
    let active = true;
    void api
      .classroomStudents(assignClassroomId)
      .then((links) => {
        if (active) setAssigned(links);
      })
      .catch((err) => {
        if (active) setError(errMessage(err, 'Gagal memuat siswa kelas'));
      });
    return () => {
      active = false;
    };
  }, [assignClassroomId]);

  // Siswa kelas untuk entri nilai.
  useEffect(() => {
    if (!gradeClassroomId) {
      setGradeStudents([]);
      return;
    }
    let active = true;
    void api
      .classroomStudents(gradeClassroomId)
      .then((links) => {
        if (active) setGradeStudents(links);
      })
      .catch((err) => {
        if (active) setError(errMessage(err, 'Gagal memuat siswa kelas'));
      });
    return () => {
      active = false;
    };
  }, [gradeClassroomId]);

  // Nilai yang sudah tersimpan untuk kelas+mapel+term.
  useEffect(() => {
    if (!gradeClassroomId || !gradeSubjectId) {
      setGradeInputs({});
      return;
    }
    let active = true;
    void api
      .grades(gradeClassroomId, { subjectId: gradeSubjectId, term: gradeTerm })
      .then((list) => {
        if (!active) return;
        const map: Record<string, string> = {};
        for (const g of list) map[g.studentId] = String(Number(g.score));
        // Gabungkan dengan input pengguna yang sudah diisi lebih dulu agar
        // pengetikan cepat tidak tertimpa hasil muat nilai dari server.
        setGradeInputs((prev) => ({ ...map, ...prev }));
      })
      .catch((err) => {
        if (active) setError(errMessage(err, 'Gagal memuat nilai'));
      });
    return () => {
      active = false;
    };
  }, [gradeClassroomId, gradeSubjectId, gradeTerm]);

  // Daftar raport.
  useEffect(() => {
    if (!rcClassroomId) {
      setReportCards([]);
      return;
    }
    let active = true;
    void api
      .reportCards(rcClassroomId, rcSemesterId || undefined)
      .then((list) => {
        if (active) setReportCards(list);
      })
      .catch((err) => {
        if (active) setError(errMessage(err, 'Gagal memuat raport'));
      });
    return () => {
      active = false;
    };
  }, [rcClassroomId, rcSemesterId]);

  const assignedIds = useMemo(
    () => new Set(assigned.map((a) => a.studentId)),
    [assigned],
  );
  const availableStudents = useMemo(
    () => students.filter((s) => !assignedIds.has(s.id)),
    [students, assignedIds],
  );

  // ---------- Aksi ----------

  function onCreateStudent(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api.createStudent(schoolId, {
        fullName: studentName,
        nisn: studentNisn || undefined,
        gender: studentGender || undefined,
      });
      setStudentName('');
      setStudentNisn('');
      setStudentGender('');
      await loadStudents();
      setNotice('Siswa ditambahkan.');
    });
  }

  function onImportStudents(event: React.FormEvent) {
    event.preventDefault();
    if (!importFile) {
      setError('Pilih berkas CSV terlebih dahulu.');
      return;
    }
    void run(async () => {
      const result = await api.importStudents(schoolId, importFile);
      setImportResult(result);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadStudents();
      setNotice(`${result.created} siswa diimpor, ${result.skipped} dilewati.`);
    });
  }

  function onDeleteStudent(student: Student) {
    void run(async () => {
      await api.deleteStudent(student.id);
      await loadStudents();
      setNotice(`Siswa ${student.fullName} dinonaktifkan.`);
    });
  }

  function onCreateSubject(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api.createSubject(schoolId, {
        name: subjectName,
        code: subjectCode,
      });
      setSubjectName('');
      setSubjectCode('');
      await loadSubjects();
      setNotice('Mata pelajaran ditambahkan.');
    });
  }

  function onAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!assignClassroomId || assignSelection.length === 0) {
      setError('Pilih kelas dan minimal satu siswa.');
      return;
    }
    void run(async () => {
      const result = await api.assignStudents(
        assignClassroomId,
        assignSelection,
      );
      setAssignSelection([]);
      setAssigned(await api.classroomStudents(assignClassroomId));
      if (assignClassroomId === gradeClassroomId) {
        setGradeStudents(await api.classroomStudents(assignClassroomId));
      }
      setNotice(`${result.assigned} siswa ditugaskan ke kelas.`);
    });
  }

  function onSaveGrades(event: React.FormEvent) {
    event.preventDefault();
    if (!gradeClassroomId || !gradeSubjectId) {
      setError('Pilih kelas dan mata pelajaran.');
      return;
    }
    const entries = gradeStudents
      .map((link) => ({
        studentId: link.studentId,
        raw: gradeInputs[link.studentId],
      }))
      .filter((item) => item.raw !== undefined && item.raw !== '')
      .map((item) => ({
        studentId: item.studentId,
        subjectId: gradeSubjectId,
        term: gradeTerm,
        score: Number(item.raw),
      }));

    if (entries.length === 0) {
      setError('Isi minimal satu nilai.');
      return;
    }
    if (entries.some((e) => Number.isNaN(e.score) || e.score < 0 || e.score > 100)) {
      setError('Nilai harus berupa angka 0–100.');
      return;
    }

    void run(async () => {
      const result = await api.saveGrades(gradeClassroomId, entries);
      setNotice(`${result.saved} nilai disimpan.`);
    });
  }

  function onGenerateReportCards(event: React.FormEvent) {
    event.preventDefault();
    if (!rcClassroomId || !rcSemesterId) {
      setError('Pilih kelas dan semester.');
      return;
    }
    void run(async () => {
      const result = await api.generateReportCards(rcClassroomId, rcSemesterId);
      setReportCards(
        await api.reportCards(rcClassroomId, rcSemesterId || undefined),
      );
      setNotice(`${result.generated} raport berhasil dibuat.`);
    });
  }

  // ---------- Render ----------

  return (
    <div data-testid="eraport-panel">
      {error && (
        <div className="alert alert-error" data-testid="eraport-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" data-testid="eraport-notice">
          {notice}
        </div>
      )}

      <div className="card">
        <h3>Struktur Akademik</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Data E-Raport mengikuti tahun ajaran, semester, dan kelas yang sudah
          dibuat di halaman sekolah.
        </p>
        {years.length === 0 ? (
          <p className="empty" data-testid="eraport-no-year">
            Belum ada tahun ajaran. Buat di halaman sekolah terlebih dahulu.
          </p>
        ) : (
          <div className="form-row">
            <div className="field">
              <label htmlFor="eraport-year">Tahun ajaran</label>
              <select
                id="eraport-year"
                data-testid="eraport-year-select"
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isActive ? ' (aktif)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tahun terpilih</label>
              <span className="muted">
                {semesters.length} semester · {classrooms.length} kelas
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ----- Data Siswa ----- */}
      <div className="card">
        <h3>Data Siswa ({students.length})</h3>
        <form onSubmit={onCreateStudent}>
          <div className="form-row">
            <div className="field" style={{ flex: '2 1 240px' }}>
              <label htmlFor="eraport-student-name">Nama lengkap</label>
              <input
                id="eraport-student-name"
                data-testid="student-name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="field">
              <label htmlFor="eraport-student-nisn">NISN</label>
              <input
                id="eraport-student-nisn"
                data-testid="student-nisn"
                value={studentNisn}
                onChange={(e) => setStudentNisn(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="eraport-student-gender">Jenis kelamin</label>
              <select
                id="eraport-student-gender"
                data-testid="student-gender"
                value={studentGender}
                onChange={(e) => setStudentGender(e.target.value)}
              >
                <option value="">—</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
            <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy}
                data-testid="create-student"
              >
                Tambah Siswa
              </button>
            </div>
          </div>
        </form>

        <form onSubmit={onImportStudents} style={{ marginTop: 8 }}>
          <div className="form-row">
            <div className="field" style={{ flex: '2 1 240px' }}>
              <label htmlFor="eraport-import">Impor CSV (kolom: fullName, nisn, gender, birthDate)</label>
              <input
                id="eraport-import"
                type="file"
                accept=".csv,text/csv"
                data-testid="student-import-file"
                ref={fileInputRef}
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                type="submit"
                disabled={busy}
                data-testid="student-import-submit"
              >
                Impor
              </button>
            </div>
          </div>
        </form>

        {importResult && (
          <div className="alert alert-success" data-testid="import-result">
            Impor selesai: {importResult.created} dibuat, {importResult.skipped}{' '}
            dilewati.
          </div>
        )}

        {students.length === 0 ? (
          <p className="empty" data-testid="student-empty">
            Belum ada siswa.
          </p>
        ) : (
          <table data-testid="student-list">
            <thead>
              <tr>
                <th>Nama</th>
                <th>NISN</th>
                <th>JK</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} data-testid="student-row">
                  <td>{s.fullName}</td>
                  <td>{s.nisn ?? '-'}</td>
                  <td>{s.gender ?? '-'}</td>
                  <td>{s.status}</td>
                  <td>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={busy || s.status === 'inactive'}
                      data-testid="delete-student"
                      onClick={() => onDeleteStudent(s)}
                    >
                      Nonaktifkan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ----- Mata Pelajaran ----- */}
      <div className="card">
        <h3>Mata Pelajaran ({subjects.length})</h3>
        <form onSubmit={onCreateSubject}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="eraport-subject-name">Nama</label>
              <input
                id="eraport-subject-name"
                data-testid="subject-name"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="field">
              <label htmlFor="eraport-subject-code">Kode</label>
              <input
                id="eraport-subject-code"
                data-testid="subject-code"
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy}
                data-testid="create-subject"
              >
                Tambah Mapel
              </button>
            </div>
          </div>
        </form>
        {subjects.length === 0 ? (
          <p className="empty" data-testid="subject-empty">
            Belum ada mata pelajaran.
          </p>
        ) : (
          <ul className="plain-list" data-testid="subject-list">
            {subjects.map((s) => (
              <li key={s.id} data-testid="subject-item">
                <strong>{s.code}</strong> — {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ----- Penugasan Kelas ----- */}
      <div className="card">
        <h3>Penugasan Siswa ke Kelas</h3>
        <div className="form-row">
          <div className="field">
            <label htmlFor="eraport-assign-class">Kelas</label>
            <select
              id="eraport-assign-class"
              data-testid="assign-classroom"
              value={assignClassroomId}
              onChange={(e) => setAssignClassroomId(e.target.value)}
            >
              {classrooms.length === 0 && <option value="">— belum ada kelas —</option>}
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (tingkat {c.gradeLevel})
                </option>
              ))}
            </select>
          </div>
        </div>

        {assignClassroomId && (
          <>
            <h4>Terdaftar ({assigned.length})</h4>
            {assigned.length === 0 ? (
              <p className="empty">Belum ada siswa di kelas ini.</p>
            ) : (
              <ul className="plain-list" data-testid="assigned-list">
                {assigned.map((a) => (
                  <li key={a.id} data-testid="assigned-item">
                    {a.student.fullName}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={onAssign} style={{ marginTop: 12 }}>
              <h4>Belum terdaftar ({availableStudents.length})</h4>
              {availableStudents.length === 0 ? (
                <p className="empty">Semua siswa sudah terdaftar.</p>
              ) : (
                <div
                  data-testid="available-students"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  {availableStudents.map((s) => (
                    <label
                      key={s.id}
                      className="muted"
                      style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                    >
                      <input
                        type="checkbox"
                        data-testid="available-student-checkbox"
                        checked={assignSelection.includes(s.id)}
                        onChange={(e) =>
                          setAssignSelection((prev) =>
                            e.target.checked
                              ? [...prev, s.id]
                              : prev.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {s.fullName}
                    </label>
                  ))}
                </div>
              )}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy || availableStudents.length === 0}
                data-testid="assign-submit"
              >
                Tugaskan ke {selectedClassroom(assignClassroomId)?.name ?? 'kelas'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* ----- Entri Nilai ----- */}
      <div className="card">
        <h3>Entri Nilai</h3>
        <div className="form-row">
          <div className="field">
            <label htmlFor="eraport-grade-class">Kelas</label>
            <select
              id="eraport-grade-class"
              data-testid="grade-classroom"
              value={gradeClassroomId}
              onChange={(e) => {
                setGradeClassroomId(e.target.value);
                setGradeInputs({});
              }}
            >
              {classrooms.length === 0 && <option value="">— belum ada kelas —</option>}
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="eraport-grade-subject">Mata pelajaran</label>
            <select
              id="eraport-grade-subject"
              data-testid="grade-subject"
              value={gradeSubjectId}
              onChange={(e) => {
                setGradeSubjectId(e.target.value);
                setGradeInputs({});
              }}
            >
              <option value="">— pilih mapel —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="eraport-grade-term">Term</label>
            <select
              id="eraport-grade-term"
              data-testid="grade-term"
              value={gradeTerm}
              onChange={(e) => {
                setGradeTerm(e.target.value as AcademicTermValue);
                setGradeInputs({});
              }}
            >
              <option value="odd">Ganjil</option>
              <option value="even">Genap</option>
            </select>
          </div>
        </div>

        {!gradeSubjectId ? (
          <p className="empty">Pilih mata pelajaran untuk mengisi nilai.</p>
        ) : gradeStudents.length === 0 ? (
          <p className="empty" data-testid="grade-empty">
            Belum ada siswa di kelas ini. Tugaskan siswa terlebih dahulu.
          </p>
        ) : (
          <form onSubmit={onSaveGrades}>
            <table data-testid="grade-table">
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>Nilai (0–100)</th>
                </tr>
              </thead>
              <tbody>
                {gradeStudents.map((link) => (
                  <tr key={link.id} data-testid="grade-row">
                    <td>{link.student.fullName}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        data-testid="grade-input"
                        value={gradeInputs[link.studentId] ?? ''}
                        onChange={(e) =>
                          setGradeInputs((prev) => ({
                            ...prev,
                            [link.studentId]: e.target.value,
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy}
              data-testid="save-grades"
              style={{ marginTop: 12 }}
            >
              Simpan Nilai
            </button>
          </form>
        )}
      </div>

      {/* ----- Raport ----- */}
      <div className="card">
        <h3>Raport</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Raport dibuat dalam format PDF (retensi permanen) berdasarkan nilai
          kelas pada semester terpilih.
        </p>
        <form onSubmit={onGenerateReportCards}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="eraport-rc-class">Kelas</label>
              <select
                id="eraport-rc-class"
                data-testid="report-classroom"
                value={rcClassroomId}
                onChange={(e) => setRcClassroomId(e.target.value)}
              >
                {classrooms.length === 0 && <option value="">— belum ada kelas —</option>}
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="eraport-rc-semester">Semester</label>
              <select
                id="eraport-rc-semester"
                data-testid="report-semester"
                value={rcSemesterId}
                onChange={(e) => setRcSemesterId(e.target.value)}
              >
                {semesters.length === 0 && <option value="">— belum ada semester —</option>}
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.term === 'odd' ? 'Ganjil' : 'Genap'})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy || !rcClassroomId || !rcSemesterId}
                data-testid="generate-report-cards"
              >
                Generate Raport
              </button>
            </div>
          </div>
        </form>

        {reportCards.length === 0 ? (
          <p className="empty" data-testid="report-card-empty">
            Belum ada raport untuk kelas/semester ini.
          </p>
        ) : (
          <table data-testid="report-card-list">
            <thead>
              <tr>
                <th>Siswa</th>
                <th>Semester</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th>Unduh</th>
              </tr>
            </thead>
            <tbody>
              {reportCards.map((rc) => (
                <tr key={rc.id} data-testid="report-card-row">
                  <td>{rc.student?.fullName ?? rc.studentId}</td>
                  <td>{rc.semester?.name ?? '-'}</td>
                  <td>{rc.status}</td>
                  <td>
                    {rc.generatedAt
                      ? new Date(rc.generatedAt).toLocaleString('id-ID')
                      : '-'}
                  </td>
                  <td>
                    <a
                      className="btn btn-ghost"
                      data-testid="download-report-card"
                      href={api.reportCardPdfUrl(rc.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
