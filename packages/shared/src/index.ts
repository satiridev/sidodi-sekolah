// Tipe & konstanta bersama antar apps (web & api)

export const USER_ROLES = [
  'headmaster',
  'head_of_administration',
  'teacher',
  'operator',
  'auditor',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const RETENTION_TYPES = [
  'financial_5y',
  'academic_permanent',
  'custom',
] as const;
export type RetentionType = (typeof RETENTION_TYPES)[number];

export const DOC_STATUSES = [
  'active',
  'archived',
  'pending_deletion',
  'deleted',
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const PLAN_CODES = ['trial', 'basic', 'pro'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Batas ukuran file default: 100 MB (kebijakan Belajar.id & internal). */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** Ekstensi berbahaya yang selalu diblokir. */
export const BLOCKED_EXTENSIONS = [
  'apk',
  'exe',
  'bat',
  'cmd',
  'msi',
  'scr',
  'dmg',
  'pkg',
  'sh',
  'vbs',
  'jar',
] as const;

/** Ekstensi video besar yang tidak relevan untuk arsip kerja. */
export const LARGE_VIDEO_EXTENSIONS = [
  'mp4',
  'mkv',
  'mov',
  'avi',
  'wmv',
  'flv',
  'webm',
] as const;

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

/** Ambil ekstensi (lowercase, tanpa titik) dari nama file. */
export function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : '';
}
