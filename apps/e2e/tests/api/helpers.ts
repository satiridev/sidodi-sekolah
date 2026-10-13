import { APIRequestContext, APIResponse, expect } from '@playwright/test';

/**
 * Helper bersama untuk test API. Membuat data unik per pemanggilan agar test
 * tidak saling bergantung dan bisa dijalankan berulang tanpa reset DB.
 */

let seq = 0;

export function uniqueEmail(prefix = 'pengguna'): string {
  seq += 1;
  const rand = Math.floor(Math.random() * 1_000_000);
  return `${prefix}.${Date.now()}.${seq}.${rand}@sekolah.test`;
}

export function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function uniqueName(prefix: string): string {
  seq += 1;
  return `${prefix} ${Date.now()}-${seq}-${Math.floor(Math.random() * 1000)}`;
}

/** Assert status dan kembalikan body mentah (string) dengan pesan error jelas. */
export async function expectStatus(res: APIResponse, expected: number): Promise<string> {
  const body = await res.text();
  expect(res.status(), `Response body: ${body}`).toBe(expected);
  return body;
}

export async function json<T = any>(res: APIResponse, expected: number): Promise<T> {
  const body = await expectStatus(res, expected);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Respons bukan JSON valid: ${body}`);
  }
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  token: string;
}

export interface TestSchool {
  id: string;
  name: string;
  slug: string;
  planCode: string;
  [key: string]: unknown;
}

const DEFAULT_PASSWORD = 'rahasia123';

export async function registerUser(
  request: APIRequestContext,
  overrides: Partial<{ email: string; password: string; name: string }> = {},
): Promise<TestUser> {
  const email = overrides.email ?? uniqueEmail('pengguna');
  const password = overrides.password ?? DEFAULT_PASSWORD;
  const name = overrides.name ?? 'Pengguna Uji';

  const res = await request.post('/auth/register', {
    data: { email, password, name },
  });
  const body = await json<{ accessToken: string; user: { id: string } }>(res, 201);
  return { id: body.user.id, email, password, name, token: body.accessToken };
}

export async function login(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post('/auth/login', { data: { email, password } });
  const body = await json<{ accessToken: string }>(res, 201);
  return body.accessToken;
}

export async function createSchool(
  request: APIRequestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<TestSchool> {
  const res = await request.post('/schools', {
    headers: auth(token),
    data: { name: uniqueName('Sekolah Uji'), ...overrides },
  });
  return json<TestSchool>(res, 201);
}

/** Registrasi user + buat sekolah (user jadi headmaster). */
export async function setupSchool(request: APIRequestContext): Promise<{
  user: TestUser;
  school: TestSchool;
}> {
  const user = await registerUser(request);
  const school = await createSchool(request, user.token);
  return { user, school };
}

export async function createDocumentType(
  request: APIRequestContext,
  token: string,
  schoolId: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await request.post(`/schools/${schoolId}/document-types`, {
    headers: auth(token),
    data: {
      name: uniqueName('Jenis Dokumen'),
      code: `JENIS${Date.now()}${Math.floor(Math.random() * 1000)}`,
      retentionType: 'custom',
      ...overrides,
    },
  });
  return json(res, 201);
}

export async function createAcademicYear(
  request: APIRequestContext,
  token: string,
  schoolId: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await request.post(`/schools/${schoolId}/academic-years`, {
    headers: auth(token),
    data: {
      name: `TA-${Date.now()}`,
      startDate: '2025-07-01T00:00:00.000Z',
      endDate: '2026-06-30T00:00:00.000Z',
      isActive: true,
      ...overrides,
    },
  });
  return json(res, 201);
}

export async function createSemester(
  request: APIRequestContext,
  token: string,
  academicYearId: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await request.post(`/academic-years/${academicYearId}/semesters`, {
    headers: auth(token),
    data: { name: 'Semester Ganjil', term: 'odd', ...overrides },
  });
  return json(res, 201);
}

export async function createClassroom(
  request: APIRequestContext,
  token: string,
  schoolId: string,
  academicYearId: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await request.post(`/schools/${schoolId}/classrooms`, {
    headers: auth(token),
    data: { name: `Kelas ${Date.now()}`, gradeLevel: 10, academicYearId, ...overrides },
  });
  return json(res, 201);
}

export async function createDocument(
  request: APIRequestContext,
  token: string,
  schoolId: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const res = await request.post('/documents', {
    headers: auth(token),
    data: { schoolId, title: uniqueName('Dokumen'), ...overrides },
  });
  return json(res, 201);
}

export interface UploadOptions {
  schoolId: string;
  documentId?: string;
  documentTypeId?: string;
  folderId?: string;
  title?: string;
  fileName: string;
  mimeType?: string;
  content: Buffer | string;
}

export interface UploadResult {
  sessionId: string;
  initiate: any;
  complete: any;
}

export async function initiateUpload(
  request: APIRequestContext,
  token: string,
  opts: UploadOptions,
): Promise<any> {
  const size = Buffer.byteLength(opts.content);
  const res = await request.post('/uploads/initiate', {
    headers: auth(token),
    data: {
      schoolId: opts.schoolId,
      documentId: opts.documentId,
      documentTypeId: opts.documentTypeId,
      folderId: opts.folderId,
      title: opts.title,
      fileName: opts.fileName,
      mimeType: opts.mimeType ?? 'application/octet-stream',
      sizeBytes: size,
    },
  });
  return json(res, 201);
}

export async function sendUploadContent(
  request: APIRequestContext,
  token: string,
  sessionId: string,
  opts: UploadOptions,
): Promise<any> {
  const res = await request.post(`/uploads/${sessionId}/content`, {
    headers: auth(token),
    multipart: {
      file: {
        name: opts.fileName,
        mimeType: opts.mimeType ?? 'application/octet-stream',
        buffer: Buffer.isBuffer(opts.content) ? opts.content : Buffer.from(opts.content),
      },
    },
  });
  return json(res, 201);
}

export async function completeUpload(
  request: APIRequestContext,
  token: string,
  sessionId: string,
): Promise<any> {
  const res = await request.post(`/uploads/${sessionId}/complete`, {
    headers: auth(token),
  });
  return json(res, 201);
}

/** Alur penuh initiate -> content -> complete. */
export async function uploadAndComplete(
  request: APIRequestContext,
  token: string,
  opts: UploadOptions,
): Promise<UploadResult> {
  const initiate = await initiateUpload(request, token, opts);
  await sendUploadContent(request, token, initiate.id, opts);
  const complete = await completeUpload(request, token, initiate.id);
  return { sessionId: initiate.id, initiate, complete };
}

/**
 * Download file dokumen: ambil presigned URL dari API lalu stream.
 * Mengembalikan isi file sebagai Buffer.
 */
export async function downloadDocument(
  request: APIRequestContext,
  token: string,
  documentId: string,
  apiOrigin: string,
): Promise<{ fileName: string; body: Buffer }> {
  const res = await request.get(`/documents/${documentId}/download`, {
    headers: auth(token),
  });
  const meta = await json<{ url: string; fileName: string }>(res, 200);
  const fileUrl = meta.url.startsWith('http') ? meta.url : `${apiOrigin}${meta.url}`;
  const fileRes = await request.get(fileUrl, { headers: auth(token) });
  const body = Buffer.from(await fileRes.body());
  expect(fileRes.status(), `Gagal mengunduh file: ${fileRes.status()}`).toBe(200);
  return { fileName: meta.fileName, body };
}
