import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';

export interface AuditInput {
  schoolId?: string;
  actorUserId?: string;
  actorMembershipId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditListQuery {
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Append-only: hanya INSERT. */
  async log(input: AuditInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        actorMembershipId: input.actorMembershipId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  /** Riwayat audit tingkat sekolah, terbaru lebih dahulu (dengan filter + paginasi). */
  async listForSchool(
    schoolId: string,
    userId: string,
    query: AuditListQuery = {},
  ) {
    await this.access.assertRole(userId, schoolId, [
      'headmaster',
      'head_of_administration',
      'auditor',
    ]);

    const where: Prisma.AuditLogWhereInput = { schoolId };
    if (query.action && (Object.values(AuditAction) as string[]).includes(query.action)) {
      where.action = query.action as AuditAction;
    }
    if (query.entityType) where.entityType = query.entityType;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 25, 1), 200);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actorUser: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return { data, total, page, limit };
  }
}
