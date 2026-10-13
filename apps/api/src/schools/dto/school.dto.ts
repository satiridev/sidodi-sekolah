import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Matches, Min, Max, MaxLength, MinLength } from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,59}$/, {
    message: 'slug hanya berisi huruf kecil, angka, dan tanda hubung (3-60 karakter)',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  npsn?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  npsn?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /**
   * Persetujuan (opt-in) berbagi metrik anonim untuk dashboard lintas sekolah
   * (yayasan/dinas). Hanya kepala sekolah/admin yang boleh mengubahnya.
   */
  @IsOptional()
  @IsBoolean()
  analyticsOptIn?: boolean;
}

export class UpdateSchoolSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(1048576)
  @Max(5242880000)
  maxFileSizeBytes?: number;

  @IsOptional()
  @IsNumber()
  @Min(1073741824)
  quotaBytes?: number;
}