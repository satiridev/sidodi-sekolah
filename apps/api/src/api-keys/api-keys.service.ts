import { createHash, randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';

/** Simpan hanya hash SHA-256 dari kunci; nilai mentah hanya ditampilkan sekali. */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration', 'auditor']);
    return this.prisma.apiKey.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
  }

  async create(schoolId: string, userId: string, name: string, scopes: string[]) {
    const actor = await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration']);
    const raw = `ak_${randomBytes(24).toString('hex')}`;
    const key = await this.prisma.apiKey.create({
      data: { schoolId, name, hashedKey: hashKey(raw), scopes },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'ApiKey',
      entityId: key.id,
      metadata: { name },
    });
    return { id: key.id, key: raw, scopes };
  }

  async revoke(id: string, userId: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('API key tidak ditemukan');
    await this.access.assertRole(userId, key.schoolId, ['headmaster', 'head_of_administration']);
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.log({
      schoolId: key.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'ApiKey',
      entityId: id,
      metadata: { revoked: true },
    });
    return { revoked: true };
  }
}
