import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class CreateEijazahBatchDto {
  @IsUUID()
  academicYearId!: string;
}

export class GenerateEijazahDto {
  /** Opsional: batasi pembuatan ijazah ke siswa tertentu saja. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('4', { each: true })
  studentIds?: string[];
}
