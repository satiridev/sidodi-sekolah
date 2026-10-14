import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OnpremService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async register(schoolId: string, name: string, version?: string) {
    const exists = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Sekolah tidak ditemukan');
    const agent = await this.prisma.onpremAgent.create({
      data: {
        schoolId,
        name,
        agentToken: randomUUID(),
        version,
        status: 'offline',
      },
    });
    await this.audit.log({
      schoolId,
      action: 'create',
      entityType: 'OnpremAgent',
      entityId: agent.id,
      metadata: { name },
    });
    return agent;
  }

  async heartbeat(id: string, status?: string) {
    const agent = await this.prisma.onpremAgent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agent tidak ditemukan');
    const updated = await this.prisma.onpremAgent.update({
      where: { id },
      data: {
        lastSeenAt: new Date(),
        status: (status === 'online' || status === 'error') ? status : 'online',
      },
    });
    await this.audit.log({
      schoolId: agent.schoolId,
      action: 'update',
      entityType: 'OnpremAgent',
      entityId: id,
      metadata: { status: updated.status },
    });
    return updated;
  }

  async list(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration', 'auditor']);
    return this.prisma.onpremAgent.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
