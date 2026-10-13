import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DocStatus, DocumentVisibility, RetentionType } from '@prisma/client';
import { PaginationQuery } from '../../common/dto/pagination.dto';

export class CreateDocumentDto {
  @IsUUID()
  schoolId!: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  tags?: string[];

  @IsOptional()
  @IsEnum(RetentionType)
  retentionType?: RetentionType;

  @IsOptional()
  @IsDateString()
  retentionExpiresAt?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  tags?: string[];
}

export class ListDocumentsDto extends PaginationQuery {
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @IsEnum(DocStatus)
  status?: DocStatus;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class CheckDuplicateDto {
  @IsString()
  contentHash!: string;

  @IsUUID()
  schoolId!: string;
}

export class PolicyValidateDto {
  @IsUUID()
  schoolId!: string;

  @IsString()
  fileName!: string;

  @IsString()
  sizeBytes!: string; // prisma BigInt serialized as string; endpoints di bawah juga menerima number

  @IsOptional()
  @IsUUID()
  documentTypeId?: string;
}

export class SetLegalHoldDto {
  @IsBoolean()
  isLegalHold!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class SchedulePurgeDto {
  @IsDateString()
  scheduledPurgeAt!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}