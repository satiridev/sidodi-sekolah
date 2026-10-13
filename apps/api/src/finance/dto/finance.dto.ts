import {
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/**
 * Kategori arsip keuangan. Nilai disimpan sebagai string pada
 * `finance_archives.category`; daftar ini menjaga konsistensi pelaporan.
 */
export const FINANCE_CATEGORIES = [
  'RKAS',
  'SPJ',
  'KUITANSI',
  'LAPORAN_BOS',
  'BUKU_KAS',
  'PAJAK',
  'LAINNYA',
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

/** Batas nominal IDR yang diterima (mencegah overflow & salah input). */
const MAX_AMOUNT_IDR = 1_000_000_000_000_000;

export class ListFinanceArchivesDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsIn(FINANCE_CATEGORIES)
  category?: FinanceCategory;
}

export class CreateFinanceArchiveDto {
  @IsIn(FINANCE_CATEGORIES)
  category!: FinanceCategory;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT_IDR)
  amountIdr?: number;

  @IsOptional()
  @IsUUID()
  documentId?: string;
}

export class FinanceSummaryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class FinanceExportDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}
