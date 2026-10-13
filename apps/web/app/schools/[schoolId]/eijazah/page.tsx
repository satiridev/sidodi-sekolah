'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth';
import { EijazahPanel } from '../../../../components/eijazah-panel';
import { api, type School } from '../../../../lib/api';

/**
 * Halaman E-Ijazah: batch per tahun ajaran, generate sertifikat, penerbitan,
 * pencabutan, unduh PDF, dan verifikasi publik. Dilindungi middleware
 * (`/schools/:path*`).
 */
export default function EijazahPage() {
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
    <main className="container" data-testid="eijazah-page">
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

      <EijazahPanel schoolId={schoolId} />
    </main>
  );
}
