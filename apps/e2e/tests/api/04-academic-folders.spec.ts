import { test, expect } from './fixtures';
import {
  auth,
  createAcademicYear,
  createClassroom,
  createDocumentType,
  createSemester,
  registerUser,
  setupSchool,
  uniqueName,
} from './helpers';

test.describe('Akademik & Struktur Folder', () => {
  test('jenis dokumen: sistem tersedia + jenis kustom bisa dibuat', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);

    const listRes = await request.get(`/schools/${school.id}/document-types`, {
      headers: auth(user.token),
    });
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    expect(Array.isArray(list)).toBe(true);
    // Minimal berisi template sistem (IJAZAH, RAPORT, dst. dari seed).
    expect(list.length).toBeGreaterThanOrEqual(1);

    const created = await createDocumentType(request, user.token, school.id, {
      name: 'Surat Keterangan Uji',
      code: `SKU${Date.now()}`,
      retentionType: 'custom',
      retentionMonths: 24,
    });
    expect(created.id).toBeTruthy();
    expect(created.schoolId).toBe(school.id);

    const listRes2 = await request.get(`/schools/${school.id}/document-types`, {
      headers: auth(user.token),
    });
    const list2 = await listRes2.json();
    expect(list2.map((d: any) => d.id)).toContain(created.id);
  });

  test('tahun ajaran: hanya satu yang aktif', async ({ request }) => {
    const { user, school } = await setupSchool(request);

    const first = await createAcademicYear(request, user.token, school.id, {
      name: '2024/2025',
      isActive: true,
    });
    const second = await createAcademicYear(request, user.token, school.id, {
      name: '2025/2026',
      isActive: true,
    });

    const res = await request.get(`/schools/${school.id}/academic-years`, {
      headers: auth(user.token),
    });
    expect(res.status()).toBe(200);
    const years = await res.json();
    const active = years.filter((y: any) => y.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(second.id);

    // Aktifkan kembali yang lama via endpoint activate.
    const act = await request.post(`/academic-years/${first.id}/activate`, {
      headers: auth(user.token),
    });
    expect(act.status()).toBe(201);
    const actBody = await act.json();
    expect(actBody.isActive).toBe(true);
  });

  test('semester & kelas dibuat di bawah tahun ajaran', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const year = await createAcademicYear(request, user.token, school.id);

    const sem = await createSemester(request, user.token, year.id, {
      name: 'Semester Ganjil',
      term: 'odd',
    });
    expect(sem.academicYearId).toBe(year.id);
    expect(sem.term).toBe('odd');

    const cls = await createClassroom(request, user.token, school.id, year.id, {
      name: 'X IPA 1',
      gradeLevel: 10,
    });
    expect(cls.academicYearId).toBe(year.id);

    const semRes = await request.get(`/academic-years/${year.id}/semesters`, {
      headers: auth(user.token),
    });
    expect((await semRes.json()).map((s: any) => s.id)).toContain(sem.id);

    const clsRes = await request.get(
      `/schools/${school.id}/classrooms?academicYearId=${year.id}`,
      { headers: auth(user.token) },
    );
    expect((await clsRes.json()).map((c: any) => c.id)).toContain(cls.id);
  });

  test('generate folder: terbuat otomatis, idempoten, dan membentuk pohon', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const year = await createAcademicYear(request, user.token, school.id);
    await createSemester(request, user.token, year.id, { name: 'Ganjil', term: 'odd' });
    await createClassroom(request, user.token, school.id, year.id, {
      name: 'X-1',
      gradeLevel: 10,
    });

    const genRes = await request.post(`/schools/${school.id}/folders/generate`, {
      headers: auth(user.token),
      data: {},
    });
    expect(genRes.status()).toBe(201);
    const gen = await genRes.json();
    expect(gen.generated).toBeGreaterThan(0);
    expect(gen.totalFolders).toBeGreaterThanOrEqual(gen.generated);
    expect(gen.academicYearId).toBe(year.id);

    // Idempoten: generate ulang tidak menambah folder.
    const genRes2 = await request.post(`/schools/${school.id}/folders/generate`, {
      headers: auth(user.token),
      data: {},
    });
    const gen2 = await genRes2.json();
    expect(gen2.generated).toBe(0);
    expect(gen2.totalFolders).toBe(gen.totalFolders);

    const treeRes = await request.get(`/schools/${school.id}/folders/tree`, {
      headers: auth(user.token),
    });
    expect(treeRes.status()).toBe(200);
    const tree = await treeRes.json();
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThanOrEqual(1);
    const root = tree.find((n: any) => n.name === 'Arsip Sekolah');
    expect(root).toBeTruthy();
    expect(Array.isArray(root.children)).toBe(true);
    expect(root.children.length).toBeGreaterThan(0);
  });

  test('folder manual: create, isi (contents), update, delete', async ({ request }) => {
    const { user, school } = await setupSchool(request);

    const createRes = await request.post('/folders', {
      headers: auth(user.token),
      data: { schoolId: school.id, name: uniqueName('Folder Manual') },
    });
    expect(createRes.status()).toBe(201);
    const folder = await createRes.json();
    expect(folder.path).toContain(folder.name);

    // Buat anak lalu cek contents.
    const childRes = await request.post('/folders', {
      headers: auth(user.token),
      data: { schoolId: school.id, parentId: folder.id, name: 'Anak Folder' },
    });
    expect(childRes.status()).toBe(201);
    const child = await childRes.json();

    const contentsRes = await request.get(`/folders/${folder.id}/contents`, {
      headers: auth(user.token),
    });
    expect(contentsRes.status()).toBe(200);
    const contents = await contentsRes.json();
    expect(contents.folder.id).toBe(folder.id);
    expect(contents.children.map((c: any) => c.id)).toContain(child.id);
    expect(Array.isArray(contents.documents)).toBe(true);

    // Update nama.
    const updateRes = await request.patch(`/folders/${folder.id}`, {
      headers: auth(user.token),
      data: { name: 'Folder Manual Baru' },
    });
    expect(updateRes.status()).toBe(200);
    expect((await updateRes.json()).name).toBe('Folder Manual Baru');

    // Hapus gagal karena masih ada anak.
    const delBlocked = await request.delete(`/folders/${folder.id}`, {
      headers: auth(user.token),
    });
    expect(delBlocked.status()).toBe(400);

    // Hapus anak dulu, lalu induk.
    const delChild = await request.delete(`/folders/${child.id}`, {
      headers: auth(user.token),
    });
    expect(delChild.status()).toBe(200);
    const delParent = await request.delete(`/folders/${folder.id}`, {
      headers: auth(user.token),
    });
    expect(delParent.status()).toBe(200);
  });

  test('non-anggota tidak dapat melihat struktur akademik (403)', async ({
    request,
  }) => {
    const { school } = await setupSchool(request);
    const outsider = await registerUser(request);

    const res = await request.get(`/schools/${school.id}/academic-years`, {
      headers: auth(outsider.token),
    });
    expect(res.status()).toBe(403);
  });
});
