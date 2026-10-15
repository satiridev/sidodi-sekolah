import { APIRequestContext, request as playwrightRequest } from '@playwright/test';

/**
 * Menyiapkan data demo deterministik untuk dokumentasi & tangkapan layar.
 *
 * Seluruh penyiapan lewat API publik (tanpa sentuh database langsung) sehingga
 * dapat dijalankan ulang. Email & nama sekolah dibuat tetap agar tangkapan layar
 * stabil antar-jalankan; tiap bagian dicek dulu sebelum dibuat (idempoten).
 */

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:3001';
const API = `${API_ORIGIN}/api/v1`;

export type DemoRole =
  | 'headmaster'
  | 'head_of_administration'
  | 'teacher'
  | 'operator'
  | 'auditor';

export interface DemoUser {
  email: string;
  name: string;
  role: DemoRole;
  token: string;
  userId: string;
}

export interface DemoData {
  schoolId: string;
  schoolName: string;
  users: Record<DemoRole, DemoUser>;
}

export const DEMO = {
  schoolName: process.env.DOCS_SCHOOL_NAME ?? 'SMA Negeri 1 Nusantara',
  city: 'Jakarta',
  province: 'DKI Jakarta',
  password: 'Rahasia123!',
  users: {
    headmaster: { email: 'kepsek@nusantara-demo.sch.id', name: 'Drs. Bambang Wijaya' },
    head_of_administration: {
      email: 'ktu@nusantara-demo.sch.id',
      name: 'Siti Rahayu, S.Pd.',
    },
    teacher: { email: 'guru@nusantara-demo.sch.id', name: 'Andi Pratama, S.Pd.' },
    operator: { email: 'operator@nusantara-demo.sch.id', name: 'Rizky Hidayat' },
    auditor: { email: 'auditor@nusantara-demo.sch.id', name: 'Dewi Lestari, M.M.' },
  } as Record<DemoRole, { email: string; name: string }>,
} as const;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function json<T = any>(
  res: { status(): number; text(): Promise<string> },
  expected?: number,
): Promise<T> {
  const text = await res.text();
  if (expected !== undefined && res.status() !== expected) {
    throw new Error(`Status ${res.status()} (diharapkan ${expected}): ${text}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respons bukan JSON: ${text}`);
  }
}

/** Registrasi bila belum ada, jika tidak login. Mengembalikan token + id. */
async function ensureUser(
  ctx: APIRequestContext,
  role: DemoRole,
): Promise<DemoUser> {
  const { email, name } = DEMO.users[role];
  let res = await ctx.post(`${API}/auth/register`, {
    data: { email, password: DEMO.password, name },
  });
  if (res.status() === 409) {
    res = await ctx.post(`${API}/auth/login`, {
      data: { email, password: DEMO.password },
    });
  }
  if (!res.ok()) {
    throw new Error(`Gagal auth ${email}: ${res.status()} ${await res.text()}`);
  }
  const body = await json<{ accessToken: string; user: { id: string } }>(res);
  return { email, name, role, token: body.accessToken, userId: body.user.id };
}

/** Pastikan sekolah demo ada (dibuat kepala sekolah bila belum). */
async function ensureSchool(
  ctx: APIRequestContext,
  head: DemoUser,
): Promise<string> {
  const me = await json<{
    memberships: Array<{ schoolId: string; school: { id: string; name: string } }>;
  }>(await ctx.get(`${API}/auth/me`, { headers: bearer(head.token) }));

  const existing = me.memberships.find((m) => m.school.name === DEMO.schoolName);
  if (existing) return existing.schoolId;

  const created = await json<{ id: string }>(
    await ctx.post(`${API}/schools`, {
      headers: bearer(head.token),
      data: { name: DEMO.schoolName, city: DEMO.city, province: DEMO.province },
    }),
    201,
  );
  return created.id;
}

/** Undang + terima anggota untuk tiap peran (idempoten). */
async function ensureMembers(
  ctx: APIRequestContext,
  head: DemoUser,
  schoolId: string,
): Promise<Record<DemoRole, DemoUser>> {
  const members = await json<{ items: Array<{ user: { email: string } }> }>(
    await ctx.get(`${API}/schools/${schoolId}/members`, {
      headers: bearer(head.token),
    }),
    200,
  );
  const existingEmails = new Set(members.items.map((m) => m.user.email));

  const users: Partial<Record<DemoRole, DemoUser>> = { headmaster: head };
  for (const role of Object.keys(DEMO.users) as DemoRole[]) {
    if (role === 'headmaster') continue;
    const user = await ensureUser(ctx, role);
    if (!existingEmails.has(user.email)) {
      const membership = await json<{ invitationToken: string }>(
        await ctx.post(`${API}/schools/${schoolId}/members`, {
          headers: bearer(head.token),
          data: { email: user.email, role },
        }),
        201,
      );
      await json(
        await ctx.post(`${API}/members/accept`, {
          headers: bearer(user.token),
          data: { token: membership.invitationToken },
        }),
        201,
      );
    }
    users[role] = user;
  }
  return users as Record<DemoRole, DemoUser>;
}

/** Unggah satu dokumen lengkap (initiate → content → complete). */
async function upload(
  ctx: APIRequestContext,
  token: string,
  schoolId: string,
  opts: {
    title: string;
    fileName: string;
    mimeType: string;
    documentTypeId?: string;
    content: Buffer;
  },
): Promise<string> {
  const init = await json<{ id: string }>(
    await ctx.post(`${API}/uploads/initiate`, {
      headers: bearer(token),
      data: {
        schoolId,
        documentTypeId: opts.documentTypeId,
        title: opts.title,
        fileName: opts.fileName,
        mimeType: opts.mimeType,
        sizeBytes: opts.content.length,
      },
    }),
    201,
  );
  await ctx.post(`${API}/uploads/${init.id}/content`, {
    headers: bearer(token),
    multipart: {
      file: {
        name: opts.fileName,
        mimeType: opts.mimeType,
        buffer: opts.content,
      },
    },
  });
  const done = await json<{ documentId: string }>(
    await ctx.post(`${API}/uploads/${init.id}/complete`, {
      headers: bearer(token),
    }),
    201,
  );
  return done.documentId;
}

const isEmptyArray = (rows: unknown) => Array.isArray(rows) && rows.length === 0;

/**
 * Isi data demo (akademik, dokumen, keuangan, ijazah, integrasi). Tiap bagian
 * dicek lebih dulu sehingga aman dijalankan ulang.
 */
async function seedContent(
  ctx: APIRequestContext,
  data: DemoData,
  head: DemoUser,
): Promise<void> {
  const t = head.token;
  const schoolId = data.schoolId;
  const g = (path: string) => `${API}${path}`;

  // ---- Tahun ajaran ----
  let years = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/academic-years`), { headers: bearer(t) }),
  );
  let year = years.find((y) => y.name === '2025/2026');
  if (!year) {
    year = await json(
      await ctx.post(g(`/schools/${schoolId}/academic-years`), {
        headers: bearer(t),
        data: {
          name: '2025/2026',
          startDate: '2025-07-01T00:00:00.000Z',
          endDate: '2026-06-30T00:00:00.000Z',
          isActive: true,
        },
      }),
      201,
    );
  }

  // ---- Semester ----
  let semesters = await json<any[]>(
    await ctx.get(g(`/academic-years/${year.id}/semesters`), { headers: bearer(t) }),
  );
  const ensureSemester = async (name: string, term: string) => {
    let sem = semesters.find((s) => s.name === name);
    if (!sem) {
      sem = await json(
        await ctx.post(g(`/academic-years/${year.id}/semesters`), {
          headers: bearer(t),
          data: { name, term },
        }),
        201,
      );
      semesters = [...semesters, sem];
    }
    return sem;
  };
  const odd = await ensureSemester('Ganjil', 'odd');
  await ensureSemester('Genap', 'even');

  // ---- Kelas ----
  let classrooms = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/classrooms`), { headers: bearer(t) }),
  );
  const ensureClassroom = async (name: string, gradeLevel: number) => {
    let cls = classrooms.find((c) => c.name === name);
    if (!cls) {
      cls = await json(
        await ctx.post(g(`/schools/${schoolId}/classrooms`), {
          headers: bearer(t),
          data: { name, gradeLevel, academicYearId: year.id },
        }),
        201,
      );
      classrooms = [...classrooms, cls];
    }
    return cls;
  };
  const kelas10 = await ensureClassroom('X IPA 1', 10);
  const kelas12 = await ensureClassroom('XII IPS 1', 12);

  // ---- Struktur folder (idempoten) ----
  await ctx.post(g(`/schools/${schoolId}/folders/generate`), {
    headers: bearer(t),
    data: {},
  });

  // ---- Mata pelajaran ----
  let subjects = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/subjects`), { headers: bearer(t) }),
  );
  const ensureSubject = async (name: string, code: string) => {
    let s = subjects.find((x) => x.code === code);
    if (!s) {
      s = await json(
        await ctx.post(g(`/schools/${schoolId}/subjects`), {
          headers: bearer(t),
          data: { name, code },
        }),
        201,
      );
      subjects = [...subjects, s];
    }
    return s;
  };
  const mtk = await ensureSubject('Matematika', 'MTK');
  const bin = await ensureSubject('Bahasa Indonesia', 'BIN');
  const ipa = await ensureSubject('Ilmu Pengetahuan Alam', 'IPA');

  // ---- Siswa ----
  const studentSeed = [
    { fullName: 'Aditya Pratama', nisn: '0051234501', gender: 'L', class: kelas10 },
    { fullName: 'Bunga Lestari', nisn: '0051234502', gender: 'P', class: kelas10 },
    { fullName: 'Cahyo Nugroho', nisn: '0051234503', gender: 'L', class: kelas10 },
    { fullName: 'Fajar Nugroho', nisn: '0051234504', gender: 'L', class: kelas12 },
    { fullName: 'Gita Permata', nisn: '0051234505', gender: 'P', class: kelas12 },
  ];
  let students = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/students`), { headers: bearer(t) }),
  );
  const ensureStudent = async (s: (typeof studentSeed)[number]) => {
    let student = students.find((x) => x.nisn === s.nisn);
    if (!student) {
      student = await json(
        await ctx.post(g(`/schools/${schoolId}/students`), {
          headers: bearer(t),
          data: { fullName: s.fullName, nisn: s.nisn, gender: s.gender, status: 'active' },
        }),
        201,
      );
      students = [...students, student];
    }
    return student;
  };
  const studentIdsByClass: Record<string, string[]> = {};
  for (const s of studentSeed) {
    const student = await ensureStudent(s);
    studentIdsByClass[s.class.id] = [...(studentIdsByClass[s.class.id] ?? []), student.id];
  }

  // ---- Penugasan siswa + nilai (kelas X IPA 1) ----
  for (const [classroomId, ids] of Object.entries(studentIdsByClass)) {
    const existing = await json<any[]>(
      await ctx.get(g(`/classrooms/${classroomId}/students`), { headers: bearer(t) }),
    );
    if (existing.length === 0) {
      await ctx.post(g(`/classrooms/${classroomId}/students`), {
        headers: bearer(t),
        data: { studentIds: ids },
      });
    }
  }
  const existingGrades = await json<any[]>(
    await ctx.get(g(`/classrooms/${kelas10.id}/grades`), { headers: bearer(t) }),
  );
  if (existingGrades.length === 0) {
    const scorers = studentIdsByClass[kelas10.id] ?? [];
    const grades = scorers.flatMap((studentId, i) => [
      { studentId, subjectId: mtk.id, term: 'odd', score: 78 + ((i * 7) % 18) },
      { studentId, subjectId: bin.id, term: 'odd', score: 82 + ((i * 5) % 15) },
      { studentId, subjectId: ipa.id, term: 'odd', score: 80 + ((i * 9) % 17) },
    ]);
    await ctx.post(g(`/classrooms/${kelas10.id}/grades/bulk`), {
      headers: bearer(t),
      data: { grades },
    });
  }

  // ---- Jenis dokumen (sistem) ----
  const docTypes = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/document-types`), { headers: bearer(t) }),
  );
  const docTypeByName = (name: string) => docTypes.find((d) => d.name === name)?.id;

  // ---- Dokumen ----
  const docs = await json<{ items: any[] }>(
    await ctx.get(g(`/schools/${schoolId}/documents`), { headers: bearer(t) }),
  );
  if (isEmptyArray(docs.items)) {
    const bosPdf = Buffer.from(
      '%PDF-1.4\n% Laporan BOS Triwulan I\n%%EOF\n',
      'utf8',
    );
    const skPdf = Buffer.from('%PDF-1.4\n% SK Pembagian Tugas\n%%EOF\n', 'utf8');
    const csv = Buffer.from(
      [
        'fullName,nisn,gender',
        'Aditya Pratama,0051234501,L',
        'Bunga Lestari,0051234502,P',
        'Cahyo Nugroho,0051234503,L',
      ].join('\n'),
      'utf8',
    );

    await upload(ctx, t, schoolId, {
      title: 'Laporan BOS Triwulan I 2026',
      fileName: 'laporan-bos-triwulan-1.pdf',
      mimeType: 'application/pdf',
      documentTypeId: docTypeByName('Arsip Keuangan & Dana BOS'),
      content: bosPdf,
    });
    const skDocId = await upload(ctx, t, schoolId, {
      title: 'SK Pembagian Tugas Mengajar',
      fileName: 'sk-pembagian-tugas.pdf',
      mimeType: 'application/pdf',
      documentTypeId: docTypeByName('Surat Keputusan'),
      content: skPdf,
    });
    await upload(ctx, t, schoolId, {
      title: 'Data Siswa Kelas X IPA 1',
      fileName: 'data-siswa-kelas-x.csv',
      mimeType: 'text/csv',
      documentTypeId: docTypeByName('Data Siswa'),
      content: csv,
    });

    // Legal hold sebagai bukti kepatuhan (mis. sedang diaudit).
    await ctx.post(g(`/documents/${skDocId}/legal-hold`), {
      headers: bearer(t),
      data: {
        isLegalHold: true,
        reason: 'Dalam pemeriksaan audit internal tahun 2026',
      },
    });
  }

  // ---- Aturan retensi otomatis ----
  const rules = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/retention/rules`), { headers: bearer(t) }),
  );
  if (isEmptyArray(rules)) {
    const ruleSeed = [
      { documentTypeId: docTypeByName('Arsip Keuangan & Dana BOS'), retentionMonths: 60 },
      { documentTypeId: docTypeByName('Surat Keputusan'), retentionMonths: 120 },
      { documentTypeId: docTypeByName('Surat Masuk'), retentionMonths: 24 },
    ];
    for (const r of ruleSeed) {
      if (!r.documentTypeId) continue;
      await ctx.post(g(`/schools/${schoolId}/retention/rules`), {
        headers: bearer(t),
        data: {
          documentTypeId: r.documentTypeId,
          retentionMonths: r.retentionMonths,
          action: 'purge',
          notifyDaysBefore: [30, 7, 1],
          requiresApproval: true,
          isActive: true,
        },
      });
    }
  }

  // ---- Arsip keuangan/BOS ----
  const finance = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/finance/archives`), { headers: bearer(t) }),
  );
  if (isEmptyArray(finance)) {
    const docsNow = await json<{ items: any[] }>(
      await ctx.get(g(`/schools/${schoolId}/documents`), { headers: bearer(t) }),
    );
    const bosDoc = docsNow.items.find((d) => d.title.includes('BOS'));
    const seed = [
      { category: 'LAPORAN_BOS', amountIdr: 45_000_000, documentId: bosDoc?.id },
      { category: 'SPJ', amountIdr: 2_500_000, documentId: undefined },
      { category: 'RKAS', amountIdr: 120_000_000, documentId: undefined },
    ];
    for (const a of seed) {
      await ctx.post(g(`/schools/${schoolId}/finance/archives`), {
        headers: bearer(t),
        data: { ...a, academicYearId: year.id },
      });
    }
  }

  // ---- E-Ijazah ----
  const batches = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/eijazah/batches`), { headers: bearer(t) }),
  );
  if (isEmptyArray(batches)) {
    const batch = await json<any>(
      await ctx.post(g(`/schools/${schoolId}/eijazah/batches`), {
        headers: bearer(t),
        data: { academicYearId: year.id },
      }),
      201,
    );
    const gen = await json<any>(
      await ctx.post(g(`/eijazah/batches/${batch.id}/generate`), {
        headers: bearer(t),
        data: {},
      }),
      201,
    );
    if (gen.certificates?.length) {
      await ctx.post(g(`/eijazah/certificates/${gen.certificates[0].id}/issue`), {
        headers: bearer(t),
      });
    }
  }

  // ---- Integrasi: SSO, backup, API key, webhook, agent on-prem ----
  await ctx.patch(g(`/schools/${schoolId}/sso`), {
    headers: bearer(t),
    data: {
      domain: 'nusantara-demo.sch.id',
      clientId: '1234567890-nusantara.apps.googleusercontent.com',
      autoJoin: true,
      defaultRole: 'teacher',
      isActive: true,
    },
  });

  await ctx.patch(g(`/schools/${schoolId}/backups/config`), {
    headers: bearer(t),
    data: {
      target: 'onprem',
      scheduleCron: '0 2 * * *',
      scope: 'full',
      retentionDays: 30,
      isActive: true,
    },
  });
  const jobs = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/backups/jobs`), { headers: bearer(t) }),
  );
  if (isEmptyArray(jobs)) {
    await ctx.post(g(`/schools/${schoolId}/backups/run`), { headers: bearer(t) });
  }

  const keys = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/api-keys`), { headers: bearer(t) }),
  );
  if (isEmptyArray(keys)) {
    await ctx.post(g(`/schools/${schoolId}/api-keys`), {
      headers: bearer(t),
      data: {
        name: 'Sinkronisasi Dapodik',
        scopes: ['documents:read', 'students:read'],
      },
    });
  }

  const hooks = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/webhooks`), { headers: bearer(t) }),
  );
  if (isEmptyArray(hooks)) {
    await ctx.post(g(`/schools/${schoolId}/webhooks`), {
      headers: bearer(t),
      data: {
        url: 'https://contoh.sekolah.sch.id/hooks/arsip',
        events: ['document.created', 'eijazah.issued', 'backup.completed'],
      },
    });
  }

  const agents = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/onprem/agents`), { headers: bearer(t) }),
  );
  if (isEmptyArray(agents)) {
    const agent = await json<{ id: string; agentToken: string }>(
      await ctx.post(g(`/onprem/agents/register`), {
        headers: bearer(t),
        data: { schoolId, name: 'Server TU On-Prem', version: '1.2.0' },
      }),
      201,
    );
    await ctx.post(g(`/onprem/agents/${agent.id}/heartbeat`), {
      data: { token: agent.agentToken, status: 'online' },
    });
  }

  // ---- OCR + snapshot kepatuhan + opt-in analitik ----
  await ctx.post(g(`/schools/${schoolId}/ocr/run`), { headers: bearer(t) });

  const history = await json<any[]>(
    await ctx.get(g(`/schools/${schoolId}/compliance/history`), { headers: bearer(t) }),
  );
  if (isEmptyArray(history)) {
    await ctx.post(g(`/schools/${schoolId}/compliance/snapshot`), {
      headers: bearer(t),
      data: {},
    });
  }

  await ctx.patch(g(`/schools/${schoolId}`), {
    headers: bearer(t),
    data: { analyticsOptIn: true },
  });

  // referensi agar tidak dianggap unused (dipakai untuk dokumentasi nilai)
  void odd;
}

/** Titik masuk: siapkan user, sekolah, anggota, dan seluruh data demo. */
export async function provisionDemo(): Promise<{
  data: DemoData;
  dispose: () => Promise<void>;
}> {
  const ctx = await playwrightRequest.newContext();
  const head = await ensureUser(ctx, 'headmaster');
  const schoolId = await ensureSchool(ctx, head);
  const users = await ensureMembers(ctx, head, schoolId);
  const data: DemoData = { schoolId, schoolName: DEMO.schoolName, users };
  await seedContent(ctx, data, head);
  return { data, dispose: () => ctx.dispose() };
}
