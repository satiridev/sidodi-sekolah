import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class InitiateUploadDto {
  @IsUUID()
  schoolId!: string;

  /** Bila diisi, file menjadi versi baru dari dokumen ini. */
  @IsOptional()
  @IsUUID()
  documentId?: string;

  /** Dipakai saat membuat dokumen baru (tanpa documentId). */
  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title?: string;

  /** Catatan perubahan untuk versi baru (opsional). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MinLength(1)
  mimeType!: string;

  @IsNumber()
  sizeBytes!: number;
}

export class PartUploadDto {
  @IsNumber()
  partNumber!: number;
}