'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth';
import { AcademicPanel } from '../../../components/academic-panel';
import { VersionPanel } from '../../../components/version-panel';
import {
  api,
  ApiError,
  type AuditLogEntry,
  type ComplianceScore,
  type DocumentItem,
  type DocumentType,
  type FolderNode,
  type RetentionRule,
  type School,
  type StorageInfo,
} from '../../../lib/api';

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

function TreeList({ nodes }: { nodes: FolderNode[] }) {
  if (nodes.length === 0) {
    return <p className="empty">Belum ada folder. Klik &quot;Generate Struktur Folder&quot;.</p>;
  }
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <li key={node.id}>
          <span>{node.name}</span>
          {node.children.length > 0 && <TreeList nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

const LEGAL_HOLD_ROLES = ['headmaster', 'head_of_administration', 'auditor'];

export default function SchoolPage() {
  const router = useRouter();
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const { ready, user, roleInSchool, logout } = useAuth();
  const role = roleInSchool(schoolId);
  const canManageLegalHold = role !== null && LEGAL_HOLD_ROLES.includes(role);

  const [school, setSchool] = useState<School | null>(null);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [compliance, setCompliance] = useState<ComplianceScore | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [rules, setRules] = useState<RetentionRule[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [folderMessage, setFolderMessage] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [docTypeId, setDocTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [holdTarget, setHoldTarget] = useState<DocumentItem | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [holdBusy, setHoldBusy] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setError(null);
    try {
      const [schoolData, types, treeData, docData, score, storageData, logs, ruleList] =
        await Promise.all([
          api.getSchool(schoolId),
          api.documentTypes(schoolId),
          api.folderTree(schoolId),
          api.documents(schoolId),
          api.compliance(schoolId),
          api.storage(schoolId),
          api.auditLogs(schoolId),
          api.retentionRules(schoolId),
        ]);
      setSchool(schoolData);
      setDocTypes(types);
      setTree(treeData);
      setDocs(docData.items);
      setCompliance(score);
      setStorage(storageData);
      setAuditLogs(logs.data);
      setRules(ruleList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat data sekolah');
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (ready && !user) {
      router.replace('/login');
      return;
    }
    if (ready && user) void load();
  }, [ready, user, router, load]);

  async function refreshAfterMutation() {
    const [docData, score, storageData, logs] = await Promise.all([
      api.documents(schoolId),
      api.compliance(schoolId),
      api.storage(schoolId),
      api.auditLogs(schoolId),
    ]);
    setDocs(docData.items);
    setCompliance(score);
    setStorage(storageData);
    setAuditLogs(logs.data);
  }

  async function onGenerateFolders() {
    setGenerating(true);
    setFolderMessage(null);
    setError(null);
    try {
      const result = await api.generateFolders(schoolId);
      setFolderMessage(
        result.generated > 0
          ? `${result.generated} folder baru dibuat.`
          : 'Struktur folder sudah lengkap.',
      );
      setTree(await api.folderTree(schoolId));
      setAuditLogs((await api.auditLogs(schoolId)).data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal generate folder');
    } finally {
      setGenerating(false);
    }
  }

  async function onUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setUploadError('Pilih file terlebih dahulu.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    try {
      const result = await api.upload(schoolId, {
        file,
        documentTypeId: docTypeId || undefined,
        title: title || undefined,
        changeNote: changeNote || undefined,
      });
      setUploadMessage(
        result.deduplicated
          ? 'File identik sudah ada — tidak dibuat ulang (deduplikasi).'
          : result.versionNumber && result.versionNumber > 1
            ? `Versi ${result.versionNumber} berhasil diunggah.`
            : 'Dokumen berhasil diunggah.',
      );
      setFile(null);
      setTitle('');
      setChangeNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshAfterMutation();
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : 'Gagal mengunggah dokumen',
      );
    } finally {
      setUploading(false);
    }
  }

  function openHoldForm(doc: DocumentItem) {
    setHoldTarget(doc);
    setHoldReason('');
    setHoldError(null);
  }

  async function onConfirmHold(event: React.FormEvent) {
    event.preventDefault();
    if (!holdTarget) return;
    setHoldBusy(true);
    setHoldError(null);
    try {
      await api.setLegalHold(holdTarget.id, true, holdReason);
      setHoldTarget(null);
      setHoldReason('');
      await refreshAfterMutation();
    } catch (err) {
      setHoldError(err instanceof ApiError ? err.message : 'Gagal menetapkan legal hold');
    } finally {
      setHoldBusy(false);
    }
  }

  async function onReleaseHold(doc: DocumentItem) {
    setHoldBusy(true);
    setError(null);
    try {
      await api.setLegalHold(doc.id, false);
      await refreshAfterMutation();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal melepas legal hold');
    } finally {
      setHoldBusy(false);
    }
  }

  if (!ready || loading) {
    return (
      <main className="container">
        <p className="muted">Memuat...</p>
      </main>
    );
  }

  return (
    <main className="container" data-testid="school-page">
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          ← {school?.name ?? 'Sekolah'}
        </Link>
        <div className="nav">
          <Link
            className="btn btn-ghost"
            href={`/schools/${schoolId}/students`}
            data-testid="nav-eraport"
          >
            E-Raport
          </Link>
          <Link
            className="btn btn-ghost"
            href={`/schools/${schoolId}/eijazah`}
            data-testid="nav-eijazah"
          >
            E-Ijazah
          </Link>
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
        <div className="alert alert-error" data-testid="page-error">
          {error}
        </div>
      )}

      <div className="grid">
        <div className="card">
          <h3>Skor Kepatuhan</h3>
          <div
            className="score"
            data-testid="compliance-score"
            data-status={compliance?.status}
          >
            {compliance ? compliance.score.toFixed(2) : '-'}
          </div>
          {compliance && (
            <span className={`badge badge-${compliance.status}`}>
              {compliance.status.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        <div className="card">
          <h3>Penyimpanan</h3>
          <p style={{ margin: 0 }}>
            {formatBytes(storage?.usedBytes)} / {formatBytes(storage?.quotaBytes)}
          </p>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Terpakai {storage?.usagePercent ?? 0}%
          </p>
        </div>
      </div>

      <AcademicPanel schoolId={schoolId} />

      <div className="card">
        <h3>Struktur Folder</h3>
        <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
          <button
            className="btn btn-primary"
            onClick={onGenerateFolders}
            disabled={generating}
            data-testid="generate-folders"
          >
            {generating ? 'Membuat...' : 'Generate Struktur Folder'}
          </button>
        </div>
        {folderMessage && (
          <div className="alert alert-success" data-testid="folders-result">
            {folderMessage}
          </div>
        )}
        <div data-testid="folder-tree">
          <TreeList nodes={tree} />
        </div>
      </div>

      <div className="card">
        <h3>Unggah Dokumen</h3>
        {uploadError && (
          <div className="alert alert-error" data-testid="upload-error">
            {uploadError}
          </div>
        )}
        {uploadMessage && (
          <div className="alert alert-success" data-testid="upload-result">
            {uploadMessage}
          </div>
        )}
        <form onSubmit={onUpload}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="doc-type">Jenis dokumen</label>
              <select
                id="doc-type"
                data-testid="upload-doc-type"
                value={docTypeId}
                onChange={(e) => setDocTypeId(e.target.value)}
              >
                <option value="">— pilih jenis —</option>
                {docTypes.map((dt) => (
                  <option key={dt.id} value={dt.id}>
                    {dt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="doc-title">Judul (opsional)</label>
              <input
                id="doc-title"
                data-testid="upload-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="doc-change-note">Catatan perubahan (opsional)</label>
              <input
                id="doc-change-note"
                data-testid="upload-change-note"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="field">
              <label htmlFor="doc-file">Berkas</label>
              <input
                id="doc-file"
                type="file"
                data-testid="upload-file"
                ref={fileInputRef}
                accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={uploading}
            data-testid="upload-submit"
          >
            {uploading ? 'Mengunggah...' : 'Unggah'}
          </button>
        </form>
      </div>

      {holdTarget && (
        <div className="card" data-testid="legal-hold-form">
          <h3>Tetapkan Legal Hold</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Dokumen: <strong>{holdTarget.title}</strong>
          </p>
          {holdError && (
            <div className="alert alert-error" data-testid="legal-hold-error">
              {holdError}
            </div>
          )}
          <form onSubmit={onConfirmHold} className="form-row">
            <div className="field" style={{ flex: '1 1 320px' }}>
              <label htmlFor="hold-reason">Alasan (wajib)</label>
              <input
                id="hold-reason"
                data-testid="legal-hold-reason"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                required
                maxLength={500}
              />
            </div>
            <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={holdBusy}
                data-testid="legal-hold-confirm"
              >
                {holdBusy ? 'Menyimpan...' : 'Tetapkan'}
              </button>
            </div>
            <div className="field" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                type="button"
                data-testid="legal-hold-cancel"
                onClick={() => setHoldTarget(null)}
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3>Dokumen ({docs.length})</h3>
        {docs.length === 0 ? (
          <p className="empty" data-testid="document-empty">
            Belum ada dokumen.
          </p>
        ) : (
          <table data-testid="document-list">
            <thead>
              <tr>
                <th>Judul</th>
                <th>Jenis</th>
                <th>Status</th>
                <th>Retensi</th>
                <th>Ukuran</th>
                <th>Legal Hold</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} data-testid="document-row">
                  <td>{doc.title}</td>
                  <td>{doc.documentType?.name ?? '-'}</td>
                  <td>{doc.status}</td>
                  <td>
                    {doc.retentionExpiresAt
                      ? new Date(doc.retentionExpiresAt).toLocaleDateString('id-ID')
                      : doc.retentionType === 'academic_permanent'
                        ? 'Permanen'
                        : '-'}
                  </td>
                  <td>{doc.currentVersion ? formatBytes(doc.currentVersion.sizeBytes) : '-'}</td>
                  <td>
                    {doc.isLegalHold ? (
                      <span data-testid="legal-hold-badge">
                        <span className="badge badge-perlu_perbaikan">ditahan</span>
                        {canManageLegalHold && (
                          <button
                            className="btn btn-ghost"
                            style={{ marginLeft: 8 }}
                            disabled={holdBusy}
                            data-testid="release-hold"
                            onClick={() => void onReleaseHold(doc)}
                          >
                            Lepas
                          </button>
                        )}
                      </span>
                    ) : canManageLegalHold ? (
                      <button
                        className="btn btn-ghost"
                        disabled={holdBusy}
                        data-testid="set-hold"
                        onClick={() => openHoldForm(doc)}
                      >
                        Tetapkan
                      </button>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <VersionPanel documents={docs} />

      <div className="card">
        <h3>Jejak Audit (Terbaru)</h3>
        {auditLogs.length === 0 ? (
          <p className="empty" data-testid="audit-empty">
            Belum ada aktivitas tercatat.
          </p>
        ) : (
          <table data-testid="audit-log-list">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Aksi</th>
                <th>Entitas</th>
                <th>Aktor</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} data-testid="audit-log-row">
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>{log.action}</td>
                  <td>{log.entityType}</td>
                  <td>{log.actorUser?.name ?? 'sistem'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Aturan Retensi Otomatis ({rules.length})</h3>
        {rules.length === 0 ? (
          <p className="empty" data-testid="rules-empty">
            Belum ada aturan retensi.
          </p>
        ) : (
          <ul className="plain-list" data-testid="retention-rule-list">
            {rules.map((rule) => (
              <li key={rule.id} data-testid="retention-rule-item">
                {rule.documentType?.name ?? 'Semua jenis'}{' '}
                <span className="muted">
                  {rule.retentionMonths
                    ? `${rule.retentionMonths} bulan`
                    : 'permanen'}{' '}
                  · {rule.action}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
