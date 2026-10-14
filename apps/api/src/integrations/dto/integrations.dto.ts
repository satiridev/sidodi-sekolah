import { IsUUID } from 'class-validator';

export class DapodikSyncDto {
  @IsUUID()
  schoolId!: string;
}
