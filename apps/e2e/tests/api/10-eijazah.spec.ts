import { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures';
import {
  auth,
  createAcademicYear,
  createClassroom,
  json,
  registerUser,
  setupSchool,
  uniqueName,
} from './helpers';

async function addStudent(
  request: APIRequestContext,
  token: string,
  schoolId: string,
): Promise<any> {
  const res = await request.post(`/schools/${schoolId}/students`, {
    headers: auth(token),
    data: { fullName: uniqueName('Calon Lulus'), status: 'active' },
  });
  return json(res, 201);
}

/** Siapkan sekolah + tahun ajaran + kelas + siswa terdaftar untuk E-Ijazah. */
async function eijazahSetup(request: APIRequestContext, studentCount = 2) {
  const { user, school } = await setupSchool(request);
  const year = await createAcademicYear(request, user.token, school.id);
  const classroom = await createClassroom(request, user.token, school.id, year.id, {
    name: 'XII-1',
    gradeLevel: 12,
  });

  const students: any[] = [];
  for (let i = 0; i < studentCount; i += 1) {
    students.push(await addStudent(request, user.token, school.id));
  }
  if (students.length > 0) {
    await request.post(`/classrooms/${classroom.id}/students`, {
      headers: auth(user.token),
      data: { studentIds: students.map((s) => s.id) },
    });
  }
  return { user, school, year, classroom, students };
}

async function createBatch(
  request: APIRequestContext,
  token: string,
  schoolId: string,
  academicYearId: string,
): Promise<any> {
  const res = await request.post(`/schools/${schoolId}/eijazah/batches`, {
    headers: auth(token),
    data: { academicYearId },
  });
  return json(res, 201);
}

test.describe('E-Ijazah: batch & sertifikat', () => {
  test('batch → generate → terbitkan → verifikasi publik → unduh PDF', async ({
    request,
    anonRequest,
  }) => {
    const { user, school, year, students } = await eijazahSetup(request, 2);
    expect(students.length).toBe(2);

    const batch = await createBatch(request, user.token, school.id, year.id);
    expect(batch.academicYear.id).toBe(year.id);
    expect(batch.certificates.length).toBe(0);

    const listRes = await request.get(
      `/schools/${school.id}/eijazah/batches`,
      { headers: auth(user.token) },
    );
    expect(listRes.status()).toBe(200);
    const batches = await listRes.json();
    expect(batches.map((b: any) => b.id)).toContain(batch.id);

    const genRes = await request.post(
      `/eijazah/batches/${batch.id}/generate`,
      { headers: auth(user.token), data: {} },
    );
    expect(genRes.status()).toBe(201);
    const gen = await genRes.json();
    expect(gen.generated).toBe(2);
    expect(gen.certificates.length).toBe(2);
    const cert = gen.certificates[0];
    expect(cert.serialNumber).toMatch(/^IJZ-/);
    expect(cert.status).toBe('draft');

    // Idempoten: generate ulang tidak membuat sertifikat baru.
    const gen2Res = await request.post(
      `/eijazah/batches/${batch.id}/generate`,
      { headers: auth(user.token), data: {} },
    );
    expect(gen2Res.status()).toBe(201);
    expect((await gen2Res.json()).generated).toBe(0);

    const detailRes = await request.get(`/eijazah/batches/${batch.id}`, {
      headers: auth(user.token),
    });
    expect(detailRes.status()).toBe(200);
    expect((await detailRes.json()).certificates.length).toBe(2);

    // Terbitkan (issue) → tanda tangan elektronik.
    const issueRes = await request.post(
      `/eijazah/certificates/${cert.id}/issue`,
      { headers: auth(user.token) },
    );
    expect(issueRes.status()).toBe(200);
    const issued = await issueRes.json();
    expect(issued.status).toBe('issued');
    expect(issued.signature).toBeTruthy();
    expect(issued.issuedAt).toBeTruthy();

    // Verifikasi publik tanpa autentikasi.
    const verifyRes = await anonRequest.get(
      `/verify/${encodeURIComponent(issued.serialNumber)}`,
    );
    expect(verifyRes.status()).toBe(200);
    const verify = await verifyRes.json();
    expect(verify.valid).toBe(true);
    expect(verify.found).toBe(true);
    expect(verify.status).toBe('issued');
    expect(verify.studentName).toBe(cert.student.fullName);
    expect(verify.schoolName).toBe(school.name);

    // Nomor seri tak dikenal → valid:false.
    const unknownRes = await anonRequest.get('/verify/IJZ-TIDAK-ADA-0000');
    expect(unknownRes.status()).toBe(200);
    const unknown = await unknownRes.json();
    expect(unknown.valid).toBe(false);
    expect(unknown.found).toBe(false);

    // Unduh PDF ijazah.
    const pdfRes = await request.get(
      `/eijazah/certificates/${cert.id}/pdf`,
      { headers: auth(user.token) },
    );
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()['content-type']).toContain('application/pdf');
    const bytes = await pdfRes.body();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test('cabut ijazah membuat verifikasi tidak valid', async ({
    request,
    anonRequest,
  }) => {
    const { user, school, year } = await eijazahSetup(request, 1);
    const batch = await createBatch(request, user.token, school.id, year.id);
    const gen = await json(
      await request.post(`/eijazah/batches/${batch.id}/generate`, {
        headers: auth(user.token),
        data: {},
      }),
      201,
    );
    const cert = gen.certificates[0];

    await json(
      await request.post(`/eijazah/certificates/${cert.id}/issue`, {
        headers: auth(user.token),
      }),
      200,
    );

    const revokeRes = await request.post(
      `/eijazah/certificates/${cert.id}/revoke`,
      { headers: auth(user.token) },
    );
    expect(revokeRes.status()).toBe(200);
    const revoked = await revokeRes.json();
    expect(revoked.status).toBe('revoked');
    expect(revoked.revokedAt).toBeTruthy();

    const verify = await json(
      await anonRequest.get(`/verify/${encodeURIComponent(cert.serialNumber)}`),
      200,
    );
    expect(verify.valid).toBe(false);
    expect(verify.status).toBe('revoked');

    // Ijazah yang sudah dicabut tidak dapat diterbitkan kembali.
    const reissueRes = await request.post(
      `/eijazah/certificates/${cert.id}/issue`,
      { headers: auth(user.token) },
    );
    expect(reissueRes.status()).toBe(400);
  });

  test('generate gagal bila belum ada siswa terdaftar (400)', async ({
    request,
  }) => {
    const { user, school, year } = await eijazahSetup(request, 0);
    const batch = await createBatch(request, user.token, school.id, year.id);

    const res = await request.post(`/eijazah/batches/${batch.id}/generate`, {
      headers: auth(user.token),
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('non-anggota tidak dapat melihat batch (403)', async ({ request }) => {
    const { school } = await eijazahSetup(request, 1);
    const outsider = await registerUser(request);

    const res = await request.get(`/schools/${school.id}/eijazah/batches`, {
      headers: auth(outsider.token),
    });
    expect(res.status()).toBe(403);
  });

  test('guru dapat melihat batch tetapi tidak boleh menerbitkan (403)', async ({
    request,
  }) => {
    const { user, school, year } = await eijazahSetup(request, 1);
    const teacher = await registerUser(request);
    const membership = await json(
      await request.post(`/schools/${school.id}/members`, {
        headers: auth(user.token),
        data: { email: teacher.email, role: 'teacher' },
      }),
      201,
    );
    await request.post('/members/accept', {
      headers: auth(teacher.token),
      data: { token: membership.invitationToken },
    });

    const batch = await createBatch(request, user.token, school.id, year.id);
    const gen = await json(
      await request.post(`/eijazah/batches/${batch.id}/generate`, {
        headers: auth(user.token),
        data: {},
      }),
      201,
    );

    const listRes = await request.get(
      `/schools/${school.id}/eijazah/batches`,
      { headers: auth(teacher.token) },
    );
    expect(listRes.status()).toBe(200);

    const issueRes = await request.post(
      `/eijazah/certificates/${gen.certificates[0].id}/issue`,
      { headers: auth(teacher.token) },
    );
    expect(issueRes.status()).toBe(403);
  });
});
