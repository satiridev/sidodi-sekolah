import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { MembershipStatus, UserRole } from '@prisma/client';
import { PaginationQuery } from '../../common/dto/pagination.dto';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateMembershipDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}

export class AcceptInvitationDto {
  @IsString()
  token!: string;
}

export class ListMembersDto extends PaginationQuery {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @IsOptional()
  @IsUUID()
  schoolId?: string;
}