import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';

const ADMIN = ['headmaster', 'head_of_administration'] as const;

/** Perbandingan token tahan-waktu (timing-safe). */
function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@Injectable()
export class OnpremService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async register(
    schoolId: string,
    userId: string,
    name: string,
    version?: string,
  ) {
    const actor = await this.access.assertRole(userId, schoolId, [...ADMIN]);
    const agent = await this.prisma.onpremAgent.create({
      data: {
        schoolId,
        name,
        agentToken: randomBytes(24).toString('hex'),
        version,
        status: 'offline',
      },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'OnpremAgent',
      entityId: agent.id,
      metadata: { name },
    });
    // agentToken hanya ditampilkan sekali saat registrasi.
    return agent;
  }

  async heartbeat(id: string, token: string, status?: string) {
    const agent = await this.prisma.onpremAgent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agent tidak ditemukan');
    if (!tokenMatches(agent.agentToken, token)) {
      throw new ForbiddenException('Token agent tidak valid');
    }
    const updated = await this.prisma.onpremAgent.update({
      where: { id },
      data: {
        lastSeenAt: new Date(),
        status: status === 'error' ? 'error' : 'online',
      },
      select: {
        id: true,
        schoolId: true,
        name: true,
        version: true,
        status: true,
        lastSeenAt: true,
      },
    });
    return updated;
  }

  async list(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, [
      ...ADMIN,
      'auditor',
    ]);
    return this.prisma.onpremAgent.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        version: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  }
}
