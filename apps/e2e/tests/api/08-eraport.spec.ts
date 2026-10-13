import { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  auth,
  createAcademicYear,
  createClassroom,
  createSemester,
  json,
  registerUser,
  setupSchool,
  uniqueName,
} from './helpers';

async function addStudent(
  request: APIRequestContext,
  token: string,
  schoolId: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await request.post(`/schools/${schoolId}/students`, {
    headers: auth(token),
    data: { fullName: uniqueName('Siswa'), ...overrides },
  });
  return json(res, 201);
}

async function createSubject(
  request: APIRequestContext,
  token: string,
  schoolId: string,
): Promise<any> {
  const res = await request.post(`/schools/${schoolId}/subjects`, {
    headers: auth(token),
    data: {
      name: uniqueName('Mapel'),
      code: `MPL${Date.now()}${Math.floor(Math.random() * 1000)}`,
    },
  });
  return json(res, 201);
}

/** Siapkan sekolah + struktur akademik + mapel untuk test E-Raport. */
async function eraportSetup(request: APIRequestContext) {
  const { user, school } = await setupSchool(request);
  const year = await createAcademicYear(request, user.token, school.id);
  const semester = await createSemester(request, user.token, year.id, {
    name: 'Ganjil',
    term: 'odd',
  });
  const classroom = await createClassroom(request, user.token, school.id, year.id, {
    name: 'X-1',
    gradeLevel: 10,
  });
  const subject = await createSubject(request, user.token, school.id);
  return { user, school, year, semester, classroom, subject };
}

test.describe('E-Raport: data siswa', () => {
  test('CRUD siswa + soft delete (nonaktif)', async ({ request }) => {
    const { user, school } = await setupSchool(request);

    const created = await addStudent(request, user.token, school.id, {
      fullName: 'Budi Santoso',
      nisn: '1234567890',
      gender: 'L',
    });
    expect(created.id).toBeTruthy();
    expect(created.schoolId).toBe(school.id);
    expect(created.status).toBe('active');

    const listRes = await request.get(`/schools/${school.id}/students`, {
      headers: auth(user.token),
    });
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.map((s: any) => s.id)).toContain(created.id);

    const detailRes = await request.get(`/students/${created.id}`, {
      headers: auth(user.token),
    });
    expect(detailRes.status()).toBe(200);
    expect((await detailRes.json()).fullName).toBe('Budi Santoso');

    const updRes = await request.patch(`/students/${created.id}`, {
      headers: auth(user.token),
      data: { fullName: 'Budi Santoso Putra' },
    });
    expect(updRes.status()).toBe(200);
    expect((await updRes.json()).fullName).toBe('Budi Santoso Putra');

    const delRes = await request.delete(`/students/${created.id}`, {
      headers: auth(user.token),
    });
    expect(delRes.status()).toBe(204);

    const afterRes = await request.get(`/students/${created.id}`, {
      headers: auth(user.token),
    });
    expect(afterRes.status()).toBe(200);
    expect((await afterRes.json()).status).toBe('inactive');
  });

  test('filter siswa per kelas dan pencarian nama', async ({ request }) => {
    const { user, school, year, classroom } = await eraportSetup(request);
    const inside = await addStudent(request, user.token, school.id, {
      fullName: 'Ani Kelas Satu',
    });
    const outside = await addStudent(request, user.token, school.id, {
      fullName: 'Candra Lain Kelas',
    });

    const assignRes = await request.post(`/classrooms/${classroom.id}/students`, {
      headers: auth(user.token),
      data: { studentIds: [inside.id] },
    });
    expect(assignRes.status()).toBe(201);

    const byClassRes = await request.get(
      `/schools/${school.id}/students?classroomId=${classroom.id}`,
      { headers: auth(user.token) },
    );
    const byClass = await byClassRes.json();
    expect(byClass.map((s: any) => s.id)).toContain(inside.id);
    expect(byClass.map((s: any) => s.id)).not.toContain(outside.id);

    const byQRes = await request.get(
      `/schools/${school.id}/students?q=Candra`,
      { headers: auth(user.token) },
    );
    const byQ = await byQRes.json();
    expect(byQ.map((s: any) => s.id)).toEqual([outside.id]);

    // Filter tahun ajaran lewat relasi penugasan kelas.
    const byYearRes = await request.get(
      `/schools/${school.id}/students?academicYearId=${year.id}`,
      { headers: auth(user.token) },
    );
    const byYear = await byYearRes.json();
    expect(byYear.map((s: any) => s.id)).toContain(inside.id);
    expect(byYear.map((s: any) => s.id)).not.toContain(outside.id);
  });

  test('impor siswa via CSV (202): baris valid dibuat, baris kosong dilewati', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const csv = [
      'fullName,nisn,gender,birthDate',
      'Dewi Lestari,2001,perempuan,2010-03-15',
      'Eko Prasetyo,2002,L,2010-04-16',
      ',2003,L,2010-05-17',
    ].join('\n');

    const res = await request.post(`/schools/${school.id}/students/import`, {
      headers: auth(user.token),
      multipart: {
        file: {
          name: 'siswa.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv),
        },
      },
    });
    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(1);
    expect(body.errors.length).toBe(1);

    const listRes = await request.get(`/schools/${school.id}/students`, {
      headers: auth(user.token),
    });
    const names = (await listRes.json()).map((s: any) => s.fullName);
    expect(names).toContain('Dewi Lestari');
    expect(names).toContain('Eko Prasetyo');
  });

  test('non-anggota tidak dapat melihat siswa (403)', async ({ request }) => {
    const { school } = await setupSchool(request);
    const outsider = await registerUser(request);

    const res = await request.get(`/schools/${school.id}/students`, {
      headers: auth(outsider.token),
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('E-Raport: mata pelajaran', () => {
  test('buat + daftar mapel; kode duplikat ditolak', async ({ request }) => {
    const { user, school } = await setupSchool(request);

    const subject = await createSubject(request, user.token, school.id);
    expect(subject.id).toBeTruthy();

    const listRes = await request.get(`/schools/${school.id}/subjects`, {
      headers: auth(user.token),
    });
    expect(listRes.status()).toBe(200);
    expect((await listRes.json()).map((s: any) => s.id)).toContain(subject.id);

    const dupRes = await request.post(`/schools/${school.id}/subjects`, {
      headers: auth(user.token),
      data: { name: 'Mapel Lain', code: subject.code },
    });
    expect(dupRes.status()).toBe(409);
  });
});

test.describe('E-Raport: nilai', () => {
  test('penugasan siswa, input nilai massal, dan upsert idempoten', async ({
    request,
  }) => {
    const { user, school, classroom, subject } = await eraportSetup(request);
    const s1 = await addStudent(request, user.token, school.id);
    const s2 = await addStudent(request, user.token, school.id);

    const assignRes = await request.post(`/classrooms/${classroom.id}/students`, {
      headers: auth(user.token),
      data: { studentIds: [s1.id, s2.id] },
    });
    expect(assignRes.status()).toBe(201);
    expect((await assignRes.json()).assigned).toBe(2);

    const membersRes = await request.get(
      `/classrooms/${classroom.id}/students`,
      { headers: auth(user.token) },
    );
    expect(membersRes.status()).toBe(200);
    expect((await membersRes.json()).length).toBe(2);

    const bulkRes = await request.post(
      `/classrooms/${classroom.id}/grades/bulk`,
      {
        headers: auth(user.token),
        data: {
          grades: [
            { studentId: s1.id, subjectId: subject.id, term: 'odd', score: 88 },
            {
              studentId: s2.id,
              subjectId: subject.id,
              term: 'odd',
              score: 75,
              note: 'Perlu latihan',
            },
          ],
        },
      },
    );
    expect(bulkRes.status()).toBe(201);
    expect((await bulkRes.json()).saved).toBe(2);

    const gradesRes = await request.get(
      `/classrooms/${classroom.id}/grades?subjectId=${subject.id}&term=odd`,
      { headers: auth(user.token) },
    );
    const grades = await gradesRes.json();
    expect(grades.length).toBe(2);

    // Upsert nilai tunggal menimpa nilai lama (tidak membuat duplikat).
    const upsertRes = await request.post(
      `/classrooms/${classroom.id}/grades`,
      {
        headers: auth(user.token),
        data: { studentId: s1.id, subjectId: subject.id, term: 'odd', score: 95 },
      },
    );
    expect(upsertRes.status()).toBe(201);
    expect(Number((await upsertRes.json()).score)).toBe(95);

    const gradesRes2 = await request.get(
      `/classrooms/${classroom.id}/grades?subjectId=${subject.id}&term=odd`,
      { headers: auth(user.token) },
    );
    expect((await gradesRes2.json()).length).toBe(2);
  });

  test('nilai di luar 0–100 ditolak (400)', async ({ request }) => {
    const { user, school, classroom, subject } = await eraportSetup(request);
    const s1 = await addStudent(request, user.token, school.id);

    const res = await request.post(`/classrooms/${classroom.id}/grades`, {
      headers: auth(user.token),
      data: { studentId: s1.id, subjectId: subject.id, term: 'odd', score: 150 },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('E-Raport: pembuatan raport PDF', () => {
  test('generate raport per kelas lalu unduh PDF', async ({ request }) => {
    const { user, school, classroom, semester, subject } =
      await eraportSetup(request);
    const s1 = await addStudent(request, user.token, school.id, {
      fullName: 'Fajar Nugroho',
    });
    const s2 = await addStudent(request, user.token, school.id, {
      fullName: 'Gita Permata',
    });

    await request.post(`/classrooms/${classroom.id}/students`, {
      headers: auth(user.token),
      data: { studentIds: [s1.id, s2.id] },
    });
    await request.post(`/classrooms/${classroom.id}/grades/bulk`, {
      headers: auth(user.token),
      data: {
        grades: [
          { studentId: s1.id, subjectId: subject.id, term: 'odd', score: 90 },
          { studentId: s2.id, subjectId: subject.id, term: 'odd', score: 82 },
        ],
      },
    });

    const genRes = await request.post(
      `/classrooms/${classroom.id}/report-cards/generate`,
      { headers: auth(user.token), data: { semesterId: semester.id } },
    );
    expect(genRes.status()).toBe(201);
    const gen = await genRes.json();
    expect(gen.generated).toBe(2);
    expect(gen.reportCards.length).toBe(2);
    expect(gen.reportCards[0].status).toBe('generated');

    const listRes = await request.get(
      `/classrooms/${classroom.id}/report-cards?semesterId=${semester.id}`,
      { headers: auth(user.token) },
    );
    expect(listRes.status()).toBe(200);
    const cards = await listRes.json();
    expect(cards.length).toBe(2);

    // Unduh PDF dan verifikasi tanda tangan berkas PDF.
    const pdfRes = await request.get(`/report-cards/${cards[0].id}/pdf`, {
      headers: auth(user.token),
    });
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()['content-type']).toContain('application/pdf');
    const bytes = await pdfRes.body();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);

    // Idempoten: generate ulang tidak menambah baris raport.
    const genRes2 = await request.post(
      `/classrooms/${classroom.id}/report-cards/generate`,
      { headers: auth(user.token), data: { semesterId: semester.id } },
    );
    expect(genRes2.status()).toBe(201);
    const listRes2 = await request.get(
      `/classrooms/${classroom.id}/report-cards?semesterId=${semester.id}`,
      { headers: auth(user.token) },
    );
    expect((await listRes2.json()).length).toBe(2);
  });

  test('generate gagal bila belum ada siswa di kelas (400)', async ({
    request,
  }) => {
    const { user, classroom, semester } = await eraportSetup(request);

    const res = await request.post(
      `/classrooms/${classroom.id}/report-cards/generate`,
      { headers: auth(user.token), data: { semesterId: semester.id } },
    );
    expect(res.status()).toBe(400);
  });

  test('non-anggota tidak dapat mengunduh raport (403)', async ({ request }) => {
    const { user, school, classroom, semester, subject } =
      await eraportSetup(request);
    const s1 = await addStudent(request, user.token, school.id);
    await request.post(`/classrooms/${classroom.id}/students`, {
      headers: auth(user.token),
      data: { studentIds: [s1.id] },
    });
    await request.post(`/classrooms/${classroom.id}/grades`, {
      headers: auth(user.token),
      data: { studentId: s1.id, subjectId: subject.id, term: 'odd', score: 80 },
    });
    const genRes = await request.post(
      `/classrooms/${classroom.id}/report-cards/generate`,
      { headers: auth(user.token), data: { semesterId: semester.id } },
    );
    const cardId = (await genRes.json()).reportCards[0].id;

    const outsider = await registerUser(request);
    const res = await request.get(`/report-cards/${cardId}/pdf`, {
      headers: auth(outsider.token),
    });
    expect(res.status()).toBe(403);
    expect(school.id).toBeTruthy();
  });
});
