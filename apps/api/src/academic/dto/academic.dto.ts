import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AcademicTerm, RetentionType } from '@prisma/client';

export class CreateAcademicYearDto {
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAcademicYearDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateSemesterDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsEnum(AcademicTerm)
  term!: AcademicTerm;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSemesterDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsEnum(AcademicTerm)
  term?: AcademicTerm;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateClassroomDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsInt()
  gradeLevel!: number;

  @IsUUID()
  academicYearId!: string;

  @IsOptional()
  @IsUUID()
  homeroomTeacherMembershipId?: string;
}

export class UpdateClassroomDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsInt()
  gradeLevel?: number;

  @IsOptional()
  @IsUUID()
  homeroomTeacherMembershipId?: string;
}

export class CreateDocumentTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RetentionType)
  retentionType!: RetentionType;

  @IsOptional()
  @IsInt()
  retentionMonths?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  allowedExtensions?: string[];

  @IsOptional()
  @IsNumber()
  maxSizeBytes?: number;

  @IsOptional()
  @IsBoolean()
  requiresLegalHold?: boolean;
}

export class UpdateDocumentTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RetentionType)
  retentionType?: RetentionType;

  @IsOptional()
  @IsInt()
  retentionMonths?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  allowedExtensions?: string[];

  @IsOptional()
  @IsNumber()
  maxSizeBytes?: number;

  @IsOptional()
  @IsBoolean()
  requiresLegalHold?: boolean;
}