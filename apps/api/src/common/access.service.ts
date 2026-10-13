import { ForbiddenException, Injectable } from '@nestjs/common';
import { Membership, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Pusat pemeriksaan hak akses berbasis membership + role.
 * Headmaster selalu dianggap boleh untuk aksinya.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async membership(userId: string, schoolId: string): Promise<Membership> {
    const m = await this.prisma.membership.findUnique({
      where: { schoolId_userId: { schoolId, userId } },
    });
    if (!m || m.status !== 'active') {
      throw new ForbiddenException('Bukan anggota aktif sekolah ini');
    }
    return m;
  }

  async assertRole(
    userId: string,
    schoolId: string,
    roles: UserRole[],
  ): Promise<Membership> {
    const m = await this.membership(userId, schoolId);
    if (m.role === 'headmaster') return m;
    if (!roles.includes(m.role)) {
      throw new ForbiddenException('Tidak punya izin untuk aksi ini');
    }
    return m;
  }
}
