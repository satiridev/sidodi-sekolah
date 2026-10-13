import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AccessService } from '../access.service';
import { ROLES_KEY, JwtUser } from '../decorators';

/**
 * Guard untuk route ber-prefix `/schools/:schoolId/...`.
 * Membaca schoolId dari params, memverifikasi membership + role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtUser | undefined;
    if (!user) throw new ForbiddenException('Belum terautentikasi');

    const schoolId: string | undefined =
      req.params?.schoolId ?? req.body?.schoolId ?? req.query?.schoolId;
    if (!schoolId) return true; // route non-tenant; dicek di service

    await this.access.assertRole(user.id, schoolId, roles);
    return true;
  }
}
