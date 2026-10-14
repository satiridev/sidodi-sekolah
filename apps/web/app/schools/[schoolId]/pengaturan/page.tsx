'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth';
import { IntegrationsPanel } from '../../../../components/integrations-panel';
import { api, type School } from '../../../../lib/api';

/**
 * Halaman Integrasi & Pengaturan: SSO Belajar.id, backup berlapis, API key,
 * webhook, dan agent on-prem. Dilindungi middleware (`/schools/:path*`).
 */
export default function PengaturanPage() {
  const router = useRouter();
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const { ready, user, logout } = useAuth();
  const [school, setSchool] = useState<School | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    void api
      .getSchool(schoolId)
      .then(setSchool)
      .catch(() => setSchool(null));
  }, [ready, user, router, schoolId]);

  if (!ready) {
    return (
      <main className="container">
        <p className="muted">Memuat...</p>
      </main>
    );
  }

  return (
    <main className="container" data-testid="pengaturan-page">
      <header className="topbar">
        <Link className="brand" href={`/schools/${schoolId}`}>
          ← {school?.name ?? 'Sekolah'}
        </Link>
        <div className="nav">
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

      <IntegrationsPanel schoolId={schoolId} />
    </main>
  );
}
