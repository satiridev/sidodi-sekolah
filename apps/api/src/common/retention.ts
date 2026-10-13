import { RetentionType } from '@prisma/client';

export interface RetentionInput {
  retentionType?: RetentionType;
  retentionExpiresAt?: Date | null;
  retentionMonths?: number | null;
  docTypeRetentionType?: RetentionType;
  docTypeRetentionMonths?: number | null;
}

export interface RetentionResult {
  retentionType: RetentionType;
  retentionExpiresAt: Date | null;
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addYears(from: Date, years: number): Date {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * Menghitung retensi dokumen (snapshot saat simpan):
 *  1. retentionExpiresAt eksplisit di DTO menang;
 *  2. kalau ada retentionMonths (dari DTO atau jenis dokumen) -> dipakai;
 *  3. kalau tipe financial_5y -> +5 tahun dari tanggal simpan;
 *  4. academic_permanent -> null (disimpan permanen).
 */
export function computeRetention(input: RetentionInput): RetentionResult {
  const retentionType =
    input.retentionType ?? input.docTypeRetentionType ?? 'custom';
  const explicit = input.retentionExpiresAt;
  if (explicit) {
    return { retentionType, retentionExpiresAt: explicit };
  }

  const months =
    input.retentionMonths ?? input.docTypeRetentionMonths ?? null;
  const now = new Date();

  let expiresAt: Date | null = null;
  if (months && months > 0) {
    expiresAt = addMonths(now, months);
  } else if (retentionType === 'financial_5y') {
    expiresAt = addYears(now, 5);
  } else if (retentionType !== 'academic_permanent') {
    // custom tanpa bulan -> 1 tahun default agar skor kepatuhan jujur
    expiresAt = addYears(now, 1);
  }

  return { retentionType, retentionExpiresAt: expiresAt };
}