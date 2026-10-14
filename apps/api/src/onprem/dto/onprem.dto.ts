import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class RegisterAgentDto {
  @IsUUID()
  schoolId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  version?: string;
}

export class AgentHeartbeatDto {
  @IsString()
  @MinLength(8)
  token!: string;

  @IsOptional()
  @IsIn(['online', 'error'])
  status?: 'online' | 'error';
}
