import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateSsoConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  domain?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  clientId?: string;

  @IsOptional()
  @IsBoolean()
  autoJoin?: boolean;

  @IsOptional()
  @IsEnum(UserRole)
  defaultRole?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
