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

/** Unduh respons biner (mis. paket ZIP) memakai cookie autentikasi. */
async function requestBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    const data = safeJson(text) as any;
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'ERROR',
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return res.blob();
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
  analyticsOptIn?: boolean;
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
  versionId?: string;
  versionNumber?: number;
  contentHash?: string;
  existingVersionId?: string;
}

// ---------- Versioning dokumen ----------

export interface DocumentVersionItem {
  id: string;
  documentId: string;
  versionNumber: number;
  storageKey: string;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: string;
  contentHash: string;
  scanStatus: string;
  ocrStatus: string;
  changeNote: string | null;
  uploadedByMembershipId: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string; email: string } | null;
}

export interface VersionCompareResult {
  from: DocumentVersionItem;
  to: DocumentVersionItem;
  contentChanged: boolean;
  sizeDeltaBytes: string;
  metadataChanges: Array<{ field: string; from: string; to: string }>;
}

// ---------- E-Raport: siswa, mapel, nilai, raport ----------

export type AcademicTermValue = 'odd' | 'even';

export interface Student {
  id: string;
  schoolId: string;
  nisn: string | null;
  nis: string | null;
  fullName: string;
  gender: string | null;
  birthDate: string | null;
  status: string;
  classrooms?: Array<{
    id: string;
    classroom: { id: string; name: string };
  }>;
}

export interface Subject {
  id: string;
  schoolId: string;
  name: string;
  code: string;
}

export interface ClassroomStudentLink {
  id: string;
  studentId: string;
  classroomId: string;
  academicYearId: string;
  student: {
    id: string;
    fullName: string;
    nisn: string | null;
    nis: string | null;
    gender: string | null;
    status: string;
  };
}

export interface Grade {
  id: string;
  studentId: string;
  classroomId: string;
  subjectId: string;
  term: AcademicTermValue;
  score: string;
  note: string | null;
  student?: { id: string; fullName: string; nisn: string | null };
  subject?: { id: string; name: string; code: string };
}

export interface GradeInput {
  studentId: string;
  subjectId: string;
  term: AcademicTermValue;
  score: number;
  note?: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  total: number;
  errors: Array<{ row: number; message: string }>;
}

export interface ReportCardItem {
  id: string;
  studentId: string;
  classroomId: string;
  academicYearId: string;
  semesterId: string;
  status: string;
  storageKey: string | null;
  generatedAt: string | null;
  student?: { id: string; fullName: string; nisn: string | null };
  semester?: { id: string; name: string; term: AcademicTermValue };
  academicYear?: { id: string; name: string };
}

// ---------- E-Ijazah: batch, sertifikat, verifikasi ----------

export type EijazahStatusValue = 'draft' | 'issued' | 'revoked';

export interface EijazahBatchSummary {
  id: string;
  schoolId: string;
  academicYearId: string;
  status: string;
  createdAt: string;
  academicYear: { id: string; name: string };
  _count?: { certificates: number };
}

export interface EijazahCertificateItem {
  id: string;
  batchId: string;
  studentId: string;
  serialNumber: string;
  contentHash: string;
  qrPayload: string | null;
  signature: string | null;
  status: EijazahStatusValue;
  issuedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  student: { id: string; fullName: string; nisn: string | null; nis: string | null };
}

export interface EijazahBatchDetail extends EijazahBatchSummary {
  certificates: EijazahCertificateItem[];
}

export interface EijazahGenerateResult {
  generated: number;
  skipped: number;
  certificates: EijazahCertificateItem[];
}

export interface EijazahVerifyResult {
  valid: boolean;
  found: boolean;
  serialNumber: string;
  status?: EijazahStatusValue;
  studentName?: string;
  schoolName?: string;
  issuedAt?: string | null;
  revokedAt?: string | null;
}


// ---------- Arsip Keuangan/BOS ----------

export type FinanceCategoryValue =
  | 'RKAS'
  | 'SPJ'
  | 'KUITANSI'
  | 'LAPORAN_BOS'
  | 'BUKU_KAS'
  | 'PAJAK'
  | 'LAINNYA';

export interface FinanceArchiveItem {
  id: string;
  schoolId: string;
  academicYearId: string | null;
  category: string;
  amountIdr: string | null;
  documentId: string | null;
  createdAt: string;
  academicYear?: { id: string; name: string } | null;
  document?: {
    id: string;
    title: string;
    status: string;
    retentionExpiresAt: string | null;
    isLegalHold: boolean;
    documentType?: { name: string; code: string } | null;
    currentVersion?: { fileName: string; sizeBytes: string } | null;
  } | null;
}

export interface FinanceSummary {
  filters: { academicYearId: string | null };
  totalCount: number;
  totalAmountIdr: string;
  byCategory: Array<{
    category: string;
    count: number;
    totalAmountIdr: string;
  }>;
  byAcademicYear: Array<{
    academicYearId: string | null;
    academicYearName: string | null;
    count: number;
    totalAmountIdr: string;
  }>;
}

// ---------- Analitik ----------

export interface AnalyticsTrendPoint {
  month: string;
  count: number;
}

export interface SchoolAnalytics {
  generatedAt: string;
  school: {
    id: string;
    name: string;
    planCode: string;
    status: string;
    analyticsOptIn: boolean;
    createdAt: string;
  };
  compliance: {
    score: number;
    status: string;
    checks: Array<{ code: string; label: string; score: number; pass: boolean }>;
    trend: Array<{ score: number; computedAt: string }>;
  };
  storage: {
    usedBytes: string;
    quotaBytes: string;
    remainingBytes: string;
    usagePercent: number;
    maxFileSizeBytes: string;
  };
  documents: {
    total: number;
    active: number;
    archived: number;
    pendingDeletion: number;
    legalHold: number;
    expiredRetention: number;
    nearingRetention: number;
  };
  folders: number;
  memberships: { total: number; active: number };
  students: { active: number; graduated: number };
  uploads: {
    totalVersions: number;
    totalSizeBytes: string;
    trend: AnalyticsTrendPoint[];
  };
  documentTypes: Array<{
    id: string | null;
    name: string;
    code: string | null;
    count: number;
  }>;
}

export interface NetworkAnalytics {
  generatedAt: string;
  scope: 'network';
  schools: {
    optedIn: number;
    byPlan: Array<{ plan: string; planName: string; count: number }>;
  };
  storage: {
    usedBytes: string;
    quotaBytes: string;
    remainingBytes: string;
    usagePercent: number;
  };
  documents: { total: number; legalHold: number };
  memberships: { active: number };
  students: { active: number };
  compliance: {
    schoolsWithScore: number;
    averageScore: number | null;
    distribution: Array<{ status: string; count: number }>;
  };
  uploads: { trend: AnalyticsTrendPoint[] };
}

// ---------- OCR & Pencarian ----------

export type OcrStatusValue = 'pending' | 'done' | 'failed' | 'skipped';

export interface OcrJobItem {
  id: string;
  documentVersionId: string;
  status: OcrStatusValue;
  language: string;
  error: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  textLength?: number;
}

export interface ExtractedText {
  documentId: string;
  versionId: string | null;
  status: OcrStatusValue | null;
  text: string;
}

export interface SearchHit {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  visibility: string;
  documentTypeId: string | null;
  documentTypeName: string | null;
  academicYearId: string | null;
  versionId: string | null;
  fileName: string | null;
  extension: string | null;
  sizeBytes: string | null;
  ocrStatus: OcrStatusValue | null;
  excerpt: string | null;
  rank: number;
}

export interface SearchFacets {
  documentType: Array<{ id: string; name: string | null; count: number }>;
  academicYear: Array<{ id: string; count: number }>;
  tags: Array<{ value: string; count: number }>;
}

export interface SearchResult {
  data: SearchHit[];
  total: number;
  page: number;
  limit: number;
  facets: SearchFacets;
}

// ---------- Integrasi & Pengaturan ----------

export type RoleValue =
  | 'headmaster'
  | 'head_of_administration'
  | 'teacher'
  | 'operator'
  | 'auditor';

export interface SsoConfig {
  id: string;
  schoolId: string;
  provider: string;
  domain: string;
  clientId: string;
  autoJoin: boolean;
  defaultRole: RoleValue;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type BackupTargetValue = 'cloud' | 'onprem';
export type BackupStatusValue = 'queued' | 'running' | 'success' | 'failed';

export interface BackupConfig {
  id: string;
  schoolId: string;
  target: BackupTargetValue;
  scheduleCron: string;
  scope: string;
  retentionDays: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackupJob {
  id: string;
  schoolId: string;
  status: BackupStatusValue;
  startedAt: string | null;
  finishedAt: string | null;
  sizeBytes: string | null;
  checksum: string | null;
  error: string | null;
  createdAt: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreated {
  id: string;
  key: string;
  scopes: string[];
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookCreated extends Webhook {
  secret: string;
}

export type AgentStatusValue = 'online' | 'offline' | 'error';

export interface OnpremAgent {
  id: string;
  name: string;
  version: string | null;
  status: AgentStatusValue;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface OnpremAgentCreated extends OnpremAgent {
  schoolId: string;
  agentToken: string;
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
  updateSchool(
    id: string,
    data: { name?: string; analyticsOptIn?: boolean },
  ) {
    return request<School>(`/schools/${id}`, { method: 'PATCH', body: data });
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

  // Versioning dokumen
  versions(documentId: string) {
    return request<DocumentVersionItem[]>(`/documents/${documentId}/versions`);
  },
  version(documentId: string, versionId: string) {
    return request<DocumentVersionItem>(
      `/documents/${documentId}/versions/${versionId}`,
    );
  },
  restoreVersion(documentId: string, versionId: string, changeNote?: string) {
    return request<DocumentVersionItem>(
      `/documents/${documentId}/versions/${versionId}/restore`,
      { method: 'POST', body: { changeNote } },
    );
  },
  compareVersions(documentId: string, from: string, to: string) {
    const qs = new URLSearchParams({ from, to });
    return request<VersionCompareResult>(
      `/documents/${documentId}/versions/compare?${qs.toString()}`,
    );
  },
  versionDownloadUrl(documentId: string, versionId: string) {
    return `${API_URL}/documents/${documentId}/versions/${versionId}/download`;
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
    input: {
      file: File;
      documentTypeId?: string;
      folderId?: string;
      title?: string;
      changeNote?: string;
    },
  ): Promise<UploadResult> {
    const session = await request<{ id: string }>('/uploads/initiate', {
      method: 'POST',
      body: {
        schoolId,
        documentTypeId: input.documentTypeId,
        folderId: input.folderId,
        title: input.title,
        changeNote: input.changeNote,
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

  // E-Raport: siswa
  students(
    schoolId: string,
    params: { q?: string; classroomId?: string; academicYearId?: string } = {},
  ) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.classroomId) qs.set('classroomId', params.classroomId);
    if (params.academicYearId) qs.set('academicYearId', params.academicYearId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<Student[]>(`/schools/${schoolId}/students${suffix}`);
  },
  createStudent(
    schoolId: string,
    data: {
      fullName: string;
      nisn?: string;
      nis?: string;
      gender?: string;
      birthDate?: string;
    },
  ) {
    return request<Student>(`/schools/${schoolId}/students`, {
      method: 'POST',
      body: data,
    });
  },
  updateStudent(
    id: string,
    data: Partial<{
      fullName: string;
      nisn: string;
      nis: string;
      gender: string;
      birthDate: string;
      status: string;
    }>,
  ) {
    return request<Student>(`/students/${id}`, { method: 'PATCH', body: data });
  },
  deleteStudent(id: string) {
    return request<null>(`/students/${id}`, { method: 'DELETE' });
  },
  importStudents(schoolId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return request<ImportResult>(`/schools/${schoolId}/students/import`, {
      method: 'POST',
      formData,
    });
  },

  // E-Raport: mata pelajaran
  subjects(schoolId: string) {
    return request<Subject[]>(`/schools/${schoolId}/subjects`);
  },
  createSubject(schoolId: string, data: { name: string; code: string }) {
    return request<Subject>(`/schools/${schoolId}/subjects`, {
      method: 'POST',
      body: data,
    });
  },

  // E-Raport: penugasan kelas
  classroomStudents(classroomId: string) {
    return request<ClassroomStudentLink[]>(
      `/classrooms/${classroomId}/students`,
    );
  },
  assignStudents(classroomId: string, studentIds: string[]) {
    return request<{ assigned: number }>(`/classrooms/${classroomId}/students`, {
      method: 'POST',
      body: { studentIds },
    });
  },

  // E-Raport: nilai
  grades(
    classroomId: string,
    params: { subjectId?: string; term?: AcademicTermValue } = {},
  ) {
    const qs = new URLSearchParams();
    if (params.subjectId) qs.set('subjectId', params.subjectId);
    if (params.term) qs.set('term', params.term);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<Grade[]>(`/classrooms/${classroomId}/grades${suffix}`);
  },
  saveGrades(classroomId: string, grades: GradeInput[]) {
    return request<{ saved: number }>(`/classrooms/${classroomId}/grades/bulk`, {
      method: 'POST',
      body: { grades },
    });
  },

  // E-Raport: raport
  reportCards(classroomId: string, semesterId?: string) {
    const suffix = semesterId
      ? `?semesterId=${encodeURIComponent(semesterId)}`
      : '';
    return request<ReportCardItem[]>(
      `/classrooms/${classroomId}/report-cards${suffix}`,
    );
  },
  generateReportCards(classroomId: string, semesterId: string) {
    return request<{ generated: number; reportCards: ReportCardItem[] }>(
      `/classrooms/${classroomId}/report-cards/generate`,
      { method: 'POST', body: { semesterId } },
    );
  },
  reportCardPdfUrl(reportCardId: string) {
    return `${API_URL}/report-cards/${reportCardId}/pdf`;
  },

  // E-Ijazah: batch & sertifikat
  eijazahBatches(schoolId: string) {
    return request<EijazahBatchSummary[]>(
      `/schools/${schoolId}/eijazah/batches`,
    );
  },
  createEijazahBatch(schoolId: string, academicYearId: string) {
    return request<EijazahBatchDetail>(
      `/schools/${schoolId}/eijazah/batches`,
      { method: 'POST', body: { academicYearId } },
    );
  },
  eijazahBatch(batchId: string) {
    return request<EijazahBatchDetail>(`/eijazah/batches/${batchId}`);
  },
  generateEijazah(batchId: string, studentIds?: string[]) {
    return request<EijazahGenerateResult>(
      `/eijazah/batches/${batchId}/generate`,
      { method: 'POST', body: studentIds?.length ? { studentIds } : {} },
    );
  },
  issueEijazah(certificateId: string) {
    return request<EijazahCertificateItem>(
      `/eijazah/certificates/${certificateId}/issue`,
      { method: 'POST' },
    );
  },
  revokeEijazah(certificateId: string) {
    return request<EijazahCertificateItem>(
      `/eijazah/certificates/${certificateId}/revoke`,
      { method: 'POST' },
    );
  },
  eijazahPdfUrl(certificateId: string) {
    return `${API_URL}/eijazah/certificates/${certificateId}/pdf`;
  },

  // Verifikasi publik (tanpa autentikasi)
  verifyEijazah(serial: string) {
    return request<EijazahVerifyResult>(
      `/verify/${encodeURIComponent(serial)}`,
    );
  },

  // Arsip Keuangan/BOS
  financeArchives(
    schoolId: string,
    params: { academicYearId?: string; category?: FinanceCategoryValue } = {},
  ) {
    const qs = new URLSearchParams();
    if (params.academicYearId) qs.set('academicYearId', params.academicYearId);
    if (params.category) qs.set('category', params.category);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<FinanceArchiveItem[]>(
      `/schools/${schoolId}/finance/archives${suffix}`,
    );
  },
  createFinanceArchive(
    schoolId: string,
    data: {
      category: FinanceCategoryValue;
      academicYearId?: string;
      amountIdr?: number;
      documentId?: string;
    },
  ) {
    return request<FinanceArchiveItem>(
      `/schools/${schoolId}/finance/archives`,
      { method: 'POST', body: data },
    );
  },
  financeSummary(schoolId: string, academicYearId?: string) {
    const suffix = academicYearId
      ? `?academicYearId=${encodeURIComponent(academicYearId)}`
      : '';
    return request<FinanceSummary>(
      `/schools/${schoolId}/finance/summary${suffix}`,
    );
  },
  /** Unduh paket audit (ZIP) sebagai blob. */
  financeExport(schoolId: string, academicYearId?: string) {
    const suffix = academicYearId
      ? `?academicYearId=${encodeURIComponent(academicYearId)}`
      : '';
    return requestBlob(`/schools/${schoolId}/finance/export${suffix}`);
  },

  // Analitik
  /** Metrik satu sekolah (kepatuhan, storage, retensi, tren unggahan). */
  schoolAnalytics(schoolId: string) {
    return request<SchoolAnalytics>(
      `/analytics/school?schoolId=${encodeURIComponent(schoolId)}`,
    );
  },
  /** Agregat anonim lintas sekolah untuk yayasan/dinas. */
  networkAnalytics() {
    return request<NetworkAnalytics>('/analytics/network');
  },

  // Pencarian & OCR
  /** Pencarian full-text ber-facet (PostgreSQL tsvector). */
  search(
    schoolId: string,
    params: {
      q: string;
      type?: string;
      year?: string;
      tags?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const qs = new URLSearchParams({ q: params.q });
    if (params.type) qs.set('type', params.type);
    if (params.year) qs.set('year', params.year);
    if (params.tags) qs.set('tags', params.tags);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return request<SearchResult>(
      `/schools/${schoolId}/search?${qs.toString()}`,
    );
  },
  /** Hasil teks yang terekstraksi (OCR) dari versi terkini dokumen. */
  extractedText(documentId: string) {
    return request<ExtractedText>(`/documents/${documentId}/extracted-text`);
  },
  /** Riwayat pekerjaan OCR dokumen. */
  ocrStatus(documentId: string) {
    return request<OcrJobItem[]>(`/documents/${documentId}/ocr/status`);
  },
  /** Jalankan ulang OCR secara sinkron. */
  ocrReprocess(documentId: string) {
    return request<OcrJobItem>(`/documents/${documentId}/ocr/reprocess`, {
      method: 'POST',
    });
  },
  /** Proses semua pekerjaan OCR tertunda di sekolah. */
  runOcr(schoolId: string) {
    return request<{ processed: number; results: OcrJobItem[] }>(
      `/schools/${schoolId}/ocr/run`,
      { method: 'POST' },
    );
  },

  // Integrasi & Pengaturan — SSO Belajar.id
  ssoConfig(schoolId: string) {
    return request<SsoConfig>(`/schools/${schoolId}/sso`);
  },
  updateSsoConfig(
    schoolId: string,
    data: {
      domain?: string;
      clientId?: string;
      autoJoin?: boolean;
      defaultRole?: RoleValue;
      isActive?: boolean;
    },
  ) {
    return request<SsoConfig>(`/schools/${schoolId}/sso`, {
      method: 'PATCH',
      body: data,
    });
  },

  // Integrasi & Pengaturan — Backup berlapis
  backupConfig(schoolId: string) {
    return request<BackupConfig>(`/schools/${schoolId}/backups/config`);
  },
  updateBackupConfig(
    schoolId: string,
    data: {
      target?: BackupTargetValue;
      scheduleCron?: string;
      scope?: string;
      retentionDays?: number;
      isActive?: boolean;
    },
  ) {
    return request<BackupConfig>(`/schools/${schoolId}/backups/config`, {
      method: 'PATCH',
      body: data,
    });
  },
  runBackup(schoolId: string) {
    return request<BackupJob>(`/schools/${schoolId}/backups/run`, {
      method: 'POST',
    });
  },
  backupJobs(schoolId: string) {
    return request<BackupJob[]>(`/schools/${schoolId}/backups/jobs`);
  },

  // Integrasi & Pengaturan — API key
  apiKeys(schoolId: string) {
    return request<ApiKeyItem[]>(`/schools/${schoolId}/api-keys`);
  },
  createApiKey(schoolId: string, data: { name: string; scopes: string[] }) {
    return request<ApiKeyCreated>(`/schools/${schoolId}/api-keys`, {
      method: 'POST',
      body: data,
    });
  },
  revokeApiKey(id: string) {
    return request<{ revoked: boolean }>(`/api-keys/${id}`, {
      method: 'DELETE',
    });
  },

  // Integrasi & Pengaturan — Webhook
  webhooks(schoolId: string) {
    return request<Webhook[]>(`/schools/${schoolId}/webhooks`);
  },
  createWebhook(schoolId: string, data: { url: string; events: string[] }) {
    return request<WebhookCreated>(`/schools/${schoolId}/webhooks`, {
      method: 'POST',
      body: data,
    });
  },
  deleteWebhook(id: string) {
    return request<{ deleted: boolean }>(`/webhooks/${id}`, {
      method: 'DELETE',
    });
  },

  // Integrasi & Pengaturan — Agent on-prem
  onpremAgents(schoolId: string) {
    return request<OnpremAgent[]>(`/schools/${schoolId}/onprem/agents`);
  },
  registerOnpremAgent(data: {
    schoolId: string;
    name: string;
    version?: string;
  }) {
    return request<OnpremAgentCreated>('/onprem/agents/register', {
      method: 'POST',
      body: data,
    });
  },
};
