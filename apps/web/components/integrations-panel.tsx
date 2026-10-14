'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type ApiKeyItem,
  type BackupConfig,
  type BackupJob,
  type OnpremAgent,
  type RoleValue,
  type SsoConfig,
  type Webhook,
} from '../lib/api';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('id-ID') : '-';
}

const SSO_ROLES: Array<{ value: RoleValue; label: string }> = [
  { value: 'head_of_administration', label: 'Kepala Tata Usaha' },
  { value: 'teacher', label: 'Guru' },
  { value: 'operator', label: 'Operator' },
  { value: 'auditor', label: 'Auditor' },
];

const API_SCOPES = [
  'documents:read',
  'documents:write',
  'students:read',
  'eijazah:read',
  'finance:read',
  'analytics:read',
];

const WEBHOOK_EVENTS = [
  'document.created',
  'document.purged',
  'eijazah.issued',
  'backup.completed',
];

const MANAGE_ROLES = ['headmaster', 'head_of_administration'];
const VIEW_ROLES = [...MANAGE_ROLES, 'auditor'];

/**
 * Halaman Integrasi & Pengaturan sekolah: SSO Belajar.id, backup berlapis,
 * API key, webhook, dan agent on-prem. Semua aksi mengikuti RBAC server
 * (kepala sekolah/kepala TU untuk perubahan; auditor hanya melihat).
 */
export function IntegrationsPanel({ schoolId }: { schoolId: string }) {
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // SSO
  const [sso, setSso] = useState<SsoConfig | null>(null);
  const [domain, setDomain] = useState('');
  const [clientId, setClientId] = useState('');
  const [autoJoin, setAutoJoin] = useState(false);
  const [defaultRole, setDefaultRole] = useState<RoleValue>('teacher');
  const [ssoActive, setSsoActive] = useState(false);

  // Backup
  const [backup, setBackup] = useState<BackupConfig | null>(null);
  const [target, setTarget] = useState<'cloud' | 'onprem'>('cloud');
  const [cron, setCron] = useState('0 2 * * *');
  const [scope, setScope] = useState('full');
  const [retentionDays, setRetentionDays] = useState(30);
  const [backupActive, setBackupActive] = useState(false);
  const [jobs, setJobs] = useState<BackupJob[]>([]);

  // API keys
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<string[]>(['documents:read']);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Webhooks
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(['document.created']);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  // On-prem agents
  const [agents, setAgents] = useState<OnpremAgent[]>([]);
  const [agentName, setAgentName] = useState('');
  const [agentVersion, setAgentVersion] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const canManage = role !== null && MANAGE_ROLES.includes(role);

  const loadLists = useCallback(async () => {
    const [keyList, hookList, agentList] = await Promise.all([
      api.apiKeys(schoolId),
      api.webhooks(schoolId),
      api.onpremAgents(schoolId),
    ]);
    setKeys(keyList);
    setHooks(hookList);
    setAgents(agentList);
  }, [schoolId]);

  const loadSso = useCallback(async () => {
    const cfg = await api.ssoConfig(schoolId);
    setSso(cfg);
    setDomain(cfg.domain ?? '');
    setClientId(cfg.clientId ?? '');
    setAutoJoin(cfg.autoJoin);
    setDefaultRole(cfg.defaultRole ?? 'teacher');
    setSsoActive(cfg.isActive);
  }, [schoolId]);

  const loadBackup = useCallback(async () => {
    const cfg = await api.backupConfig(schoolId);
    setBackup(cfg);
    setTarget(cfg.target);
    setCron(cfg.scheduleCron);
    setScope(cfg.scope);
    setRetentionDays(cfg.retentionDays);
    setBackupActive(cfg.isActive);
    setJobs(await api.backupJobs(schoolId));
  }, [schoolId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await api.me();
        const membership = me.memberships.find((m) => m.schoolId === schoolId);
        const myRole = membership?.role ?? null;
        if (!active) return;
        setRole(myRole);
        if (myRole && VIEW_ROLES.includes(myRole)) {
          await loadLists();
        }
        if (myRole && MANAGE_ROLES.includes(myRole)) {
          await Promise.all([loadSso(), loadBackup()]);
        }
      } catch (err) {
        if (active) setError(errMessage(err, 'Gagal memuat pengaturan'));
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [schoolId, loadLists, loadSso, loadBackup]);

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

  function onSaveSso(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      const updated = await api.updateSsoConfig(schoolId, {
        domain,
        clientId,
        autoJoin,
        defaultRole,
        isActive: ssoActive,
      });
      setSso(updated);
      setNotice('Konfigurasi SSO disimpan.');
    });
  }

  function onSaveBackup(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      const updated = await api.updateBackupConfig(schoolId, {
        target,
        scheduleCron: cron,
        scope,
        retentionDays: Number(retentionDays),
        isActive: backupActive,
      });
      setBackup(updated);
      setNotice('Konfigurasi backup disimpan.');
    });
  }

  function onRunBackup() {
    void run(async () => {
      await api.runBackup(schoolId);
      setJobs(await api.backupJobs(schoolId));
      setNotice('Backup diantrekan.');
    });
  }

  function onCreateKey(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      const created = await api.createApiKey(schoolId, {
        name: keyName,
        scopes: keyScopes,
      });
      setCreatedKey(created.key);
      setKeyName('');
      setKeys(await api.apiKeys(schoolId));
      setNotice('API key dibuat. Salin kuncinya sekarang.');
    });
  }

  function onRevokeKey(id: string) {
    void run(async () => {
      await api.revokeApiKey(id);
      setKeys(await api.apiKeys(schoolId));
      setNotice('API key dicabut.');
    });
  }

  function onCreateHook(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      const created = await api.createWebhook(schoolId, {
        url: hookUrl,
        events: hookEvents,
      });
      setCreatedSecret(created.secret);
      setHookUrl('');
      setHooks(await api.webhooks(schoolId));
      setNotice('Webhook dibuat. Salin secret-nya sekarang.');
    });
  }

  function onDeleteHook(id: string) {
    void run(async () => {
      await api.deleteWebhook(id);
      setHooks(await api.webhooks(schoolId));
      setNotice('Webhook dihapus.');
    });
  }

  function onRegisterAgent(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      const created = await api.registerOnpremAgent({
        schoolId,
        name: agentName,
        version: agentVersion || undefined,
      });
      setCreatedToken(created.agentToken);
      setAgentName('');
      setAgentVersion('');
      setAgents(await api.onpremAgents(schoolId));
      setNotice('Agent terdaftar. Salin token-nya sekarang.');
    });
  }

  if (!ready) {
    return (
      <div className="card" data-testid="integrations-panel">
        <p className="muted">Memuat pengaturan...</p>
      </div>
    );
  }

  if (!role || !VIEW_ROLES.includes(role)) {
    return (
      <div className="card" data-testid="integrations-panel">
        <p className="empty" data-testid="settings-no-access">
          Anda tidak memiliki akses ke pengaturan integrasi sekolah ini.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="integrations-panel">
      {error && (
        <div className="alert alert-error" data-testid="settings-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" data-testid="settings-notice">
          {notice}
        </div>
      )}

      {/* ================= SSO ================= */}
      {canManage && (
        <div className="card">
          <h3>SSO Belajar.id</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Login OIDC Google Belajar.id. Login email/password tetap tersedia
            sebagai cadangan.
          </p>
          <form onSubmit={onSaveSso}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="sso-domain">Domain email</label>
                <input
                  id="sso-domain"
                  data-testid="sso-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="sekolah.sch.id"
                />
              </div>
              <div className="field" style={{ flex: '1 1 320px' }}>
                <label htmlFor="sso-client-id">Client ID OAuth</label>
                <input
                  id="sso-client-id"
                  data-testid="sso-client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                />
              </div>
              <div className="field">
                <label htmlFor="sso-default-role">Peran default (auto-join)</label>
                <select
                  id="sso-default-role"
                  data-testid="sso-default-role"
                  value={defaultRole}
                  onChange={(e) => setDefaultRole(e.target.value as RoleValue)}
                >
                  {SSO_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <label className="field" style={{ flex: '0 0 auto' }}>
                <span>
                  <input
                    type="checkbox"
                    data-testid="sso-auto-join"
                    checked={autoJoin}
                    onChange={(e) => setAutoJoin(e.target.checked)}
                  />{' '}
                  Auto-join pengguna domain
                </span>
              </label>
              <label className="field" style={{ flex: '0 0 auto' }}>
                <span>
                  <input
                    type="checkbox"
                    data-testid="sso-active"
                    checked={ssoActive}
                    onChange={(e) => setSsoActive(e.target.checked)}
                  />{' '}
                  Aktifkan SSO
                </span>
              </label>
              <div
                className="field"
                style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
              >
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy}
                  data-testid="sso-submit"
                >
                  Simpan SSO
                </button>
              </div>
            </div>
            {sso && (
              <p className="muted" style={{ fontSize: 12 }}>
                Terakhir diperbarui: {formatDateTime(sso.updatedAt)}
              </p>
            )}
          </form>
        </div>
      )}

      {/* ================= Backup ================= */}
      {canManage && (
        <div className="card">
          <h3>Backup Berlapis</h3>
          <form onSubmit={onSaveBackup}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="backup-target">Target</label>
                <select
                  id="backup-target"
                  data-testid="backup-target"
                  value={target}
                  onChange={(e) =>
                    setTarget(e.target.value as 'cloud' | 'onprem')
                  }
                >
                  <option value="cloud">Cloud (S3)</option>
                  <option value="onprem">On-premises</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="backup-cron">Jadwal (cron)</label>
                <input
                  id="backup-cron"
                  data-testid="backup-cron"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="backup-scope">Cakupan</label>
                <input
                  id="backup-scope"
                  data-testid="backup-scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="backup-retention">Retensi (hari)</label>
                <input
                  id="backup-retention"
                  data-testid="backup-retention"
                  type="number"
                  min={1}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="form-row">
              <label className="field" style={{ flex: '0 0 auto' }}>
                <span>
                  <input
                    type="checkbox"
                    data-testid="backup-active"
                    checked={backupActive}
                    onChange={(e) => setBackupActive(e.target.checked)}
                  />{' '}
                  Aktifkan backup terjadwal
                </span>
              </label>
              <div
                className="field"
                style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
              >
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy}
                  data-testid="backup-submit"
                >
                  Simpan konfigurasi
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
                  data-testid="backup-run"
                  onClick={onRunBackup}
                >
                  Jalankan backup
                </button>
              </div>
            </div>
          </form>

          {backup && (
            <p className="muted" style={{ fontSize: 12 }}>
              Konfigurasi: {backup.target} · {backup.scheduleCron} · retensi{' '}
              {backup.retentionDays} hari
            </p>
          )}

          {jobs.length === 0 ? (
            <p className="empty" data-testid="backup-jobs-empty">
              Belum ada riwayat backup.
            </p>
          ) : (
            <table data-testid="backup-jobs">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Status</th>
                  <th>Ukuran</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} data-testid="backup-job">
                    <td>{formatDateTime(job.createdAt)}</td>
                    <td>
                      <span
                        className="badge"
                        data-testid="backup-job-status"
                      >
                        {job.status}
                      </span>
                    </td>
                    <td>{job.sizeBytes ?? '-'}</td>
                    <td>{job.error ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ================= API Keys ================= */}
      <div className="card">
        <h3>API Key</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Kunci berlingkup untuk integrasi eksternal (mis. Dapodik). Kunci
          disimpan sebagai hash dan hanya ditampilkan sekali saat dibuat.
        </p>

        {createdKey && (
          <div className="token-box" data-testid="apikey-created">
            <div className="muted">Kunci API (salin sekarang):</div>
            <code data-testid="apikey-secret">{createdKey}</code>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setCreatedKey(null)}
            >
              Tutup
            </button>
          </div>
        )}

        {canManage && (
          <form onSubmit={onCreateKey}>
            <div className="form-row">
              <div className="field" style={{ flex: '1 1 280px' }}>
                <label htmlFor="apikey-name">Nama kunci</label>
                <input
                  id="apikey-name"
                  data-testid="apikey-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="mis. Sinkronisasi Dapodik"
                />
              </div>
              <div className="field" style={{ flex: '1 1 320px' }}>
                <label>Cakupan (scope)</label>
                <div className="facets">
                  {API_SCOPES.map((s) => (
                    <label key={s} className="chip">
                      <input
                        type="checkbox"
                        data-testid="apikey-scope"
                        value={s}
                        checked={keyScopes.includes(s)}
                        onChange={(e) =>
                          setKeyScopes((prev) =>
                            e.target.checked
                              ? [...prev, s]
                              : prev.filter((x) => x !== s),
                          )
                        }
                      />{' '}
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <div
                className="field"
                style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
              >
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy}
                  data-testid="apikey-submit"
                >
                  Buat kunci
                </button>
              </div>
            </div>
          </form>
        )}

        {keys.length === 0 ? (
          <p className="empty" data-testid="apikey-empty">
            Belum ada API key.
          </p>
        ) : (
          <table data-testid="apikey-list">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Dibuat</th>
                {canManage && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} data-testid="apikey-row">
                  <td>{k.name}</td>
                  <td>{k.scopes.join(', ')}</td>
                  <td>
                    {k.revokedAt ? (
                      <span className="badge badge-buruk">dicabut</span>
                    ) : (
                      <span className="badge badge-baik">aktif</span>
                    )}
                  </td>
                  <td>{formatDateTime(k.createdAt)}</td>
                  {canManage && (
                    <td>
                      {!k.revokedAt && (
                        <button
                          className="btn btn-ghost"
                          type="button"
                          data-testid="apikey-revoke"
                          onClick={() => onRevokeKey(k.id)}
                        >
                          Cabut
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ================= Webhooks ================= */}
      <div className="card">
        <h3>Webhook</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Notifikasi event ke endpoint Anda. Secret dipakai untuk memverifikasi
          tanda tangan HMAC.
        </p>

        {createdSecret && (
          <div className="token-box" data-testid="webhook-created">
            <div className="muted">Secret webhook (salin sekarang):</div>
            <code data-testid="webhook-secret">{createdSecret}</code>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setCreatedSecret(null)}
            >
              Tutup
            </button>
          </div>
        )}

        {canManage && (
          <form onSubmit={onCreateHook}>
            <div className="form-row">
              <div className="field" style={{ flex: '1 1 320px' }}>
                <label htmlFor="webhook-url">URL endpoint</label>
                <input
                  id="webhook-url"
                  data-testid="webhook-url"
                  value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)}
                  placeholder="https://contoh.sekolah.sch.id/hooks/arsip"
                />
              </div>
              <div className="field" style={{ flex: '1 1 360px' }}>
                <label>Event</label>
                <div className="facets">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev} className="chip">
                      <input
                        type="checkbox"
                        data-testid="webhook-event"
                        value={ev}
                        checked={hookEvents.includes(ev)}
                        onChange={(e) =>
                          setHookEvents((prev) =>
                            e.target.checked
                              ? [...prev, ev]
                              : prev.filter((x) => x !== ev),
                          )
                        }
                      />{' '}
                      {ev}
                    </label>
                  ))}
                </div>
              </div>
              <div
                className="field"
                style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}
              >
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy}
                  data-testid="webhook-submit"
                >
                  Tambah webhook
                </button>
              </div>
            </div>
          </form>
        )}

        {hooks.length === 0 ? (
          <p className="empty" data-testid="webhook-empty">
            Belum ada webhook.
          </p>
        ) : (
          <table data-testid="webhook-list">
            <thead>
              <tr>
                <th>URL</th>
                <th>Event</th>
                <th>Status</th>
                {canManage && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id} data-testid="webhook-row">
                  <td>{h.url}</td>
                  <td>{h.events.join(', ')}</td>
                  <td>
                    {h.isActive ? (
                      <span className="badge badge-baik">aktif</span>
                    ) : (
                      <span className="badge">nonaktif</span>
                    )}
                  </td>
                  {canManage && (
                    <td>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        data-testid="webhook-delete"
                        onClick={() => onDeleteHook(h.id)}
                      >
                        Hapus
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ================= On-prem agents ================= */}
      <div className="card">
        <h3>Agent On-Prem</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Agent cadangan di server sekolah. Status diperbarui lewat heartbeat
          berkala memakai token agent.
        </p>

        {createdToken && (
          <div className="token-box" data-testid="agent-created">
            <div className="muted">Token agent (salin sekarang):</div>
            <code data-testid="agent-token">{createdToken}</code>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setCreatedToken(null)}
            >
              Tutup
            </button>
          </div>
        )}

        {canManage && (
          <form onSubmit={onRegisterAgent}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="agent-name">Nama agent</label>
                <input
                  id="agent-name"
                  data-testid="agent-name"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="mis. Server TU"
                />
              </div>
              <div className="field">
                <label htmlFor="agent-version">Versi (opsional)</label>
                <input
                  id="agent-version"
                  data-testid="agent-version"
                  value={agentVersion}
                  onChange={(e) => setAgentVersion(e.target.value)}
                  placeholder="1.0.0"
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
                  data-testid="agent-submit"
                >
                  Daftarkan agent
                </button>
              </div>
            </div>
          </form>
        )}

        {agents.length === 0 ? (
          <p className="empty" data-testid="agent-empty">
            Belum ada agent terdaftar.
          </p>
        ) : (
          <table data-testid="agent-list">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Versi</th>
                <th>Status</th>
                <th>Terakhir terlihat</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} data-testid="agent-row">
                  <td>{a.name}</td>
                  <td>{a.version ?? '-'}</td>
                  <td>
                    <span className="badge" data-testid="agent-status">
                      {a.status}
                    </span>
                  </td>
                  <td>{formatDateTime(a.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
