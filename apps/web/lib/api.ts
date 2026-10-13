/**
 * Klien API tipis untuk backend `apps/api` (prefix /api/v1).
 *
 * Autentikasi memakai cookie httpOnly yang di-set oleh API saat login/register
 * (`credentials: 'include'`). Tidak ada token yang disimpan di JavaScript,
 * sehingga aman dari XSS. Klien API lain tetap bisa memakai Bearer token dari
 * body respons.
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData; // biarkan browser menetapkan Content-Type + boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
  });

  const text = await res.text();
  const data = text ? (safeJson(text) as any) : null;

  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'ERROR',
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

// ---------- Tipe data ----------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
}

export interface Membership {
  id: string;
  schoolId: string;
  role: string;
  status: string;
  school: SchoolSummary;
}

export interface MeResponse {
  user: AuthUser;
  memberships: Membership[];
}

export interface AuthSession {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

export interface School {
  id: string;
  name: string;
  slug: string;
  planCode: string;
  city?: string | null;
  province?: string | null;
}

export interface DocumentType {
  id: string;
  name: string;
  code: string;
  retentionType: string;
  allowedExtensions: string[];
}

export interface FolderNode {
  id: string;
  name: string;
  path: string;
  children: FolderNode[];
}

export interface DocumentItem {
  id: string;
  title: string;
  status: string;
  visibility: string;
  retentionType: string;
  retentionExpiresAt: string | null;
  isLegalHold: boolean;
  legalHoldReason: string | null;
  legalHoldAt: string | null;
  documentType?: { name: string } | null;
  folder?: { id: string; name: string; path: string } | null;
  currentVersion?: { fileName: string; sizeBytes: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentList {
  items: DocumentItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ComplianceCheck {
  code: string;
  label: string;
  weight: number;
  score: number;
  pass: boolean;
  detail: string;
}

export interface ComplianceScore {
  score: number;
  status: string;
  generatedAt: string;
  checks: ComplianceCheck[];
}

export interface StorageInfo {
  quotaBytes: string;
  usedBytes: string;
  remainingBytes: string;
  usagePercent: number;
  maxFileSizeBytes: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface Semester {
  id: string;
  academicYearId: string;
  name: string;
  term: 'odd' | 'even';
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
}

export interface Classroom {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  gradeLevel: number;
}

export interface RetentionRule {
  id: string;
  documentTypeId: string | null;
  retentionMonths: number | null;
  action: string;
  isActive: boolean;
  documentType?: { id: string; name: string; code: string } | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actorUser?: { id: string; name: string; email: string } | null;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface UploadResult {
  deduplicated: boolean;
  documentId: string;
  versionNumber?: number;
  contentHash?: string;
}

// ---------- Endpoint ----------

export const api = {
  // Auth
  register(data: { email: string; password: string; name: string }) {
    return request<AuthSession>('/auth/register', { method: 'POST', body: data });
  },
  login(data: { email: string; password: string }) {
    return request<AuthSession>('/auth/login', { method: 'POST', body: data });
  },
  me() {
    return request<MeResponse>('/auth/me');
  },
  logout() {
    return request<{ message: string }>('/auth/logout', { method: 'POST' });
  },

  // Sekolah
  createSchool(data: { name: string; city?: string; province?: string }) {
    return request<School>('/schools', { method: 'POST', body: data });
  },
  getSchool(id: string) {
    return request<School>(`/schools/${id}`);
  },

  // Akademik
  academicYears(schoolId: string) {
    return request<AcademicYear[]>(`/schools/${schoolId}/academic-years`);
  },
  createAcademicYear(
    schoolId: string,
    data: { name: string; startDate: string; endDate: string; isActive?: boolean },
  ) {
    return request<AcademicYear>(`/schools/${schoolId}/academic-years`, {
      method: 'POST',
      body: data,
    });
  },
  activateAcademicYear(academicYearId: string) {
    return request<AcademicYear>(`/academic-years/${academicYearId}/activate`, {
      method: 'POST',
    });
  },
  semesters(academicYearId: string) {
    return request<Semester[]>(`/academic-years/${academicYearId}/semesters`);
  },
  createSemester(
    academicYearId: string,
    data: {
      name: string;
      term: 'odd' | 'even';
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
    },
  ) {
    return request<Semester>(`/academic-years/${academicYearId}/semesters`, {
      method: 'POST',
      body: data,
    });
  },
  classrooms(schoolId: string, academicYearId?: string) {
    const qs = academicYearId
      ? `?academicYearId=${encodeURIComponent(academicYearId)}`
      : '';
    return request<Classroom[]>(`/schools/${schoolId}/classrooms${qs}`);
  },
  createClassroom(
    schoolId: string,
    data: { name: string; gradeLevel: number; academicYearId: string },
  ) {
    return request<Classroom>(`/schools/${schoolId}/classrooms`, {
      method: 'POST',
      body: data,
    });
  },

  // Dokumen & folder
  documentTypes(schoolId: string) {
    return request<DocumentType[]>(`/schools/${schoolId}/document-types`);
  },
  generateFolders(schoolId: string) {
    return request<{ generated: number; totalFolders: number }>(
      `/schools/${schoolId}/folders/generate`,
      { method: 'POST', body: {} },
    );
  },
  folderTree(schoolId: string) {
    return request<FolderNode[]>(`/schools/${schoolId}/folders/tree`);
  },
  documents(schoolId: string) {
    return request<DocumentList>(`/schools/${schoolId}/documents?limit=50`);
  },
  compliance(schoolId: string) {
    return request<ComplianceScore>(`/schools/${schoolId}/compliance/score`);
  },
  storage(schoolId: string) {
    return request<StorageInfo>(`/schools/${schoolId}/storage`);
  },

  // Legal hold & audit
  setLegalHold(documentId: string, isLegalHold: boolean, reason?: string) {
    return request<DocumentItem>(`/documents/${documentId}/legal-hold`, {
      method: 'POST',
      body: { isLegalHold, reason },
    });
  },
  auditLogs(schoolId: string, limit = 25) {
    return request<AuditLogPage>(
      `/schools/${schoolId}/audit-logs?limit=${limit}`,
    );
  },
  retentionRules(schoolId: string) {
    return request<RetentionRule[]>(`/schools/${schoolId}/retention/rules`);
  },

  /** Alur unggah penuh: initiate -> content (multipart) -> complete. */
  async upload(
    schoolId: string,
    input: { file: File; documentTypeId?: string; folderId?: string; title?: string },
  ): Promise<UploadResult> {
    const session = await request<{ id: string }>('/uploads/initiate', {
      method: 'POST',
      body: {
        schoolId,
        documentTypeId: input.documentTypeId,
        folderId: input.folderId,
        title: input.title,
        fileName: input.file.name,
        mimeType: input.file.type || 'application/octet-stream',
        sizeBytes: input.file.size,
      },
    });

    const formData = new FormData();
    formData.append('file', input.file);
    await request(`/uploads/${session.id}/content`, {
      method: 'POST',
      formData,
    });

    return request<UploadResult>(`/uploads/${session.id}/complete`, {
      method: 'POST',
    });
  },
};
