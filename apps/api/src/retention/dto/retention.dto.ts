import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RetentionAction, RetentionType } from '@prisma/client';

export class CreateRetentionRuleDto {
  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1200)
  retentionMonths?: number;

  @IsEnum(RetentionAction)
  action!: RetentionAction;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  notifyDaysBefore?: number[];

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRetentionRuleDto {
  @IsOptional()
  @IsUUID()
  documentTypeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1200)
  retentionMonths?: number;

  @IsOptional()
  @IsEnum(RetentionAction)
  action?: RetentionAction;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  notifyDaysBefore?: number[];

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RetentionSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1048576)
  @Max(5242880000)
  maxFileSizeBytes?: number;

  @IsOptional()
  @IsBoolean()
  autoEnqueueExpired?: boolean;
}

export class ApprovePurgeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectPurgeDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

// Digunakan untuk skor & filter kompatibilitas.
export type { RetentionType };