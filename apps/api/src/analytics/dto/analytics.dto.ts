import { IsUUID } from 'class-validator';

export class SchoolAnalyticsQueryDto {
  @IsUUID()
  schoolId!: string;
}
