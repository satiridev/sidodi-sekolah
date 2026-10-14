import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BackupTarget } from '@prisma/client';

export class UpdateBackupConfigDto {
  @IsOptional()
  @IsEnum(BackupTarget)
  target?: BackupTarget;

  @IsOptional()
  @IsString()
  scheduleCron?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  retentionDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
