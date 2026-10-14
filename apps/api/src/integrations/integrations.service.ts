import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async syncDapodik(schoolId: string, userId: string) {
    const actor = await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration', 'operator']);
    const sync = await this.prisma.dapodikSync.create({
      data: { schoolId, status: 'queued' },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'DapodikSync',
      entityId: sync.id,
      metadata: { mode: 'manual' },
    });
    return sync;
  }

  async listDapodik(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration', 'auditor']);
    return this.prisma.dapodikSync.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
