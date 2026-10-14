import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration', 'auditor']);
    return this.prisma.webhook.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true, updatedAt: true },
    });
  }

  async create(schoolId: string, userId: string, url: string, events: string[]) {
    const actor = await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration']);
    const hook = await this.prisma.webhook.create({
      data: { schoolId, url, secret: randomUUID(), events, isActive: true },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'Webhook',
      entityId: hook.id,
      metadata: { url },
    });
    return hook;
  }

  async delete(id: string, userId: string) {
    const hook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!hook) throw new NotFoundException('Webhook tidak ditemukan');
    await this.access.assertRole(userId, hook.schoolId, ['headmaster', 'head_of_administration']);
    await this.prisma.webhook.delete({ where: { id } });
    await this.audit.log({
      schoolId: hook.schoolId,
      actorUserId: userId,
      action: 'delete',
      entityType: 'Webhook',
      entityId: id,
    });
    return { deleted: true };
  }
}
