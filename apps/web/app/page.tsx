import Link from 'next/link';
import { MAX_FILE_SIZE_BYTES, BLOCKED_EXTENSIONS } from '@arsip/shared';

export default function HomePage() {
  return (
    <main className="container">
      <header className="topbar">
        <span className="brand">Arsip Digital Sekolah</span>
        <nav className="nav">
          <Link className="btn btn-ghost" href="/login" data-testid="nav-login">
            Masuk
          </Link>
          <Link className="btn btn-primary" href="/dashboard" data-testid="nav-dashboard">
            Dashboard
          </Link>
        </nav>
      </header>

      <section className="hero">
        <h1 style={{ color: 'var(--accent)' }}>Arsip Digital Sekolah</h1>
        <p>
          Repositori arsip sekolah yang otomatis menjaga kepatuhan (UU PDP,
          retensi, struktur folder).
        </p>
        <div className="actions">
          <Link className="btn btn-primary" href="/login" data-testid="cta-start">
            Mulai sekarang
          </Link>
        </div>
      </section>

      <h2>Fitur MVP</h2>
      <ul className="feature-list">
        <li>Struktur folder otomatis: TA &gt; Semester &gt; Kelas &gt; Jenis Dokumen</li>
        <li>
          Policy engine: batas {Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB,
          block ekstensi, deteksi duplikat
        </li>
        <li>Retensi arsip &amp; legal hold</li>
        <li>RBAC + audit log</li>
        <li>Dashboard skor kepatuhan</li>
      </ul>

      <p className="muted" style={{ fontSize: 14 }}>
        Ekstensi diblokir: {BLOCKED_EXTENSIONS.join(', ')}
      </p>
    </main>
  );
}
