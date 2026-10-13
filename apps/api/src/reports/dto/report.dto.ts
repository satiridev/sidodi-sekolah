import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class GenerateReportCardsDto {
  @IsUUID()
  semesterId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  studentIds?: string[];
}

export class ListReportCardsDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;
}
