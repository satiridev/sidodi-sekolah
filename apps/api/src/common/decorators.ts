import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface JwtUser {
  id: string;
  email: string;
  name: string;
}

/** Ambil user dari request (diisi JwtStrategy). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtUser;
  },
);

export const ROLES_KEY = 'roles';
/** Batasi endpoint ke role tertentu. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
