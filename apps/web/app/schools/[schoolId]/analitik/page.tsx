'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth';
import { AnalyticsPanel } from '../../../../components/analytics-panel';
import { api, type School } from '../../../../lib/api';

/** Peran yang boleh mengubah preferensi opt-in berbagi metrik. */
const OPT_IN_ROLES = ['headmaster', 'head_of_administration'];

/**
 * Halaman Analitik Sekolah: metrik kepatuhan, storage, retensi, tren unggahan,
 * dan preferensi berbagi metrik lintas sekolah. Dilindungi middleware
 * (`/schools/:path*`).
 */
export default function AnalitikPage() {
  const router = useRouter();
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const { ready, user, roleInSchool, logout } = useAuth();
  const role = roleInSchool(schoolId);
  const canToggleOptIn = role !== null && OPT_IN_ROLES.includes(role);

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
    <main className="container" data-testid="analitik-page">
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

      <AnalyticsPanel schoolId={schoolId} canToggleOptIn={canToggleOptIn} />
    </main>
  );
}
