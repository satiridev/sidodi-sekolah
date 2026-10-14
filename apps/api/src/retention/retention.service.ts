import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, DocStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import {
  ApprovePurgeDto,
  CreateRetentionRuleDto,
  RejectPurgeDto,
  RetentionSettingsDto,
  UpdateRetentionRuleDto,
} from './dto/retention.dto';

const ADMIN: UserRole[] = ['headmaster', 'head_of_administration'];

@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async queue(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, [
      ...ADMIN,
      'auditor',
    ]);
    return this.prisma.purgeQueue.findMany({
      where: { schoolId },
      orderBy: { scheduledPurgeAt: 'asc' },
      include: {
        document: {
          include: { currentVersion: true, folder: { select: { path: true } } },
        },
        rule: true,
      },
    });
  }

  /** Riwayat notifikasi retensi berjenjang (H-30/H-7/H-1) untuk sekolah. */
  async notifications(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, [...ADMIN, 'auditor']);
    return this.prisma.retentionNotification.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        document: {
          select: { id: true, title: true, retentionExpiresAt: true, status: true },
        },
      },
    });
  }

  async settings(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { maxFileSizeBytes: true, retentionAutoEnqueue: true },
    });
    return {
      maxFileSizeBytes: school?.maxFileSizeBytes,
      defaultNotifyDaysBefore: [30, 7, 1],
      purgeRequiresApproval: true,
      autoEnqueueExpired: school?.retentionAutoEnqueue ?? true,
      dateNote: 'Kebijakan retensi mengikuti Permendikdasmen 7/2026 & PP 71/2019',
    };
  }

  async updateSettings(
    schoolId: string,
    userId: string,
    dto: RetentionSettingsDto,
  ) {
    await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration']);
    const school = await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        maxFileSizeBytes: dto.maxFileSizeBytes
          ? BigInt(dto.maxFileSizeBytes)
          : undefined,
      },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'RetentionSettings',
      entityId: schoolId,
    });
    return school;
  }

  async listRules(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    return this.prisma.retentionRule.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'asc' },
      include: { documentType: { select: { id: true, name: true, code: true } } },
    });
  }

  async createRule(
    schoolId: string,
    userId: string,
    dto: CreateRetentionRuleDto,
  ) {
    const actor = await this.access.assertRole(userId, schoolId, ADMIN);
    if (dto.documentTypeId) {
      const dt = await this.prisma.documentType.findUnique({
        where: { id: dto.documentTypeId },
      });
      if (!dt || (dt.schoolId && dt.schoolId !== schoolId)) {
        throw new BadRequestException('Jenis dokumen tidak valid');
      }
    }
    const rule = await this.prisma.retentionRule.create({
      data: {
        schoolId,
        documentTypeId: dto.documentTypeId,
        retentionMonths: dto.retentionMonths,
        action: dto.action,
        notifyDaysBefore: dto.notifyDaysBefore ?? [30, 7, 1],
        requiresApproval: dto.requiresApproval ?? true,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'RetentionRule',
      entityId: rule.id,
    });
    return rule;
  }

  async updateRule(id: string, userId: string, dto: UpdateRetentionRuleDto) {
    const rule = await this.prisma.retentionRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Aturan retensi tidak ditemukan');
    await this.access.assertRole(userId, rule.schoolId, ADMIN);
    await this.prisma.retentionRule.update({
      where: { id },
      data: {
        documentTypeId: dto.documentTypeId,
        retentionMonths: dto.retentionMonths,
        action: dto.action,
        notifyDaysBefore: dto.notifyDaysBefore,
        requiresApproval: dto.requiresApproval,
        isActive: dto.isActive,
      },
    });
    const updated = await this.prisma.retentionRule.findUnique({ where: { id } });
    await this.audit.log({
      schoolId: rule.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'RetentionRule',
      entityId: id,
    });
    return updated;
  }

  async deleteRule(id: string, userId: string) {
    const rule = await this.prisma.retentionRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Aturan retensi tidak ditemukan');
    await this.access.assertRole(userId, rule.schoolId, ADMIN);
    await this.prisma.retentionRule.delete({ where: { id } });
    await this.audit.log({
      schoolId: rule.schoolId,
      actorUserId: userId,
      action: 'delete',
      entityType: 'RetentionRule',
      entityId: id,
    });
    return { success: true };
  }

  async preview(schoolId: string, userId: string, days = 30) {
    await this.access.assertRole(userId, schoolId, [...ADMIN, 'auditor']);
    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 3600 * 1000);

    const items = await this.prisma.document.findMany({
      where: {
        schoolId,
        deletedAt: null,
        purgedAt: null,
        isLegalHold: false,
        retentionExpiresAt: { lte: horizon },
        status: { in: ['active', 'archived'] },
      },
      orderBy: { retentionExpiresAt: 'asc' },
      take: 200,
      include: {
        documentType: true,
        folder: { select: { path: true } },
        currentVersion: true,
      },
    });

    const totalBytes = items.reduce(
      (sum, d) => sum + Number(d.currentVersion?.sizeBytes ?? 0n),
      0,
    );

    return {
      asOf: now,
      horizon,
      count: items.length,
      totalBytes,
      expiringInDays: days,
      items,
    };
  }

  /** Mengantrekan dokumen yang sudah melewati batas retensi untuk pemusnahan. */
  async enqueueExpired(schoolId: string, userId: string) {
    const actor = await this.access.assertRole(userId, schoolId, ADMIN);
    const now = new Date();

    const expired = await this.prisma.document.findMany({
      where: {
        schoolId,
        deletedAt: null,
        purgedAt: null,
        isLegalHold: false,
        retentionExpiresAt: { lte: now },
        status: 'active',
      },
      take: 500,
    });

    let enqueued = 0;
    const recipientRoles = ['headmaster', 'head_of_administration'];
    const recipientCount = await this.prisma.membership.count({
      where: { schoolId, status: 'active', role: { in: ['headmaster', 'head_of_administration'] } },
    });
    for (const doc of expired) {
      const existing = await this.prisma.purgeQueue.findFirst({
        where: { documentId: doc.id, status: { in: ['pending', 'scheduled'] } },
      });
      if (existing) continue;
      await this.prisma.purgeQueue.create({
        data: {
          schoolId,
          documentId: doc.id,
          reason: 'retention_expired',
          scheduledPurgeAt: now,
          triggeredBy: 'auto',
        },
      });
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: DocStatus.pending_deletion },
      });
      enqueued += 1;
      try {
        const daysLeft = doc.retentionExpiresAt
          ? Math.ceil((doc.retentionExpiresAt.getTime() - now.getTime()) / 86400000)
          : 0;
        const stage = daysLeft <= 1 ? 1 : daysLeft <= 7 ? 7 : daysLeft <= 30 ? 30 : 0;
        if (stage > 0) {
          const existsNotif = await this.prisma.retentionNotification.findUnique({
            where: { documentId_stage: { documentId: doc.id, stage } },
          });
          if (!existsNotif) {
            await this.prisma.retentionNotification.create({
              data: {
                schoolId,
                documentId: doc.id,
                ruleId: null,
                stage,
                status: 'sent',
                documentExpiresAt: doc.retentionExpiresAt,
                recipientRoles,
                recipientCount,
              },
            });
          }
        }
      } catch {}
    }

    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'purge',
      entityType: 'PurgeQueue',
      metadata: { enqueued, scanned: expired.length },
    });
    return { scanned: expired.length, enqueued };
  }

  async approve(queueId: string, userId: string, dto: ApprovePurgeDto) {
    const queue = await this.prisma.purgeQueue.findUnique({
      where: { id: queueId },
    });
    if (!queue) throw new NotFoundException('Antrean pemusnahan tidak ditemukan');
    const actor = await this.access.assertRole(userId, queue.schoolId, ADMIN);
    if (queue.status === 'purged' || queue.status === 'rejected') {
      throw new BadRequestException('Antrean sudah berstatus final');
    }

    const approved = await this.prisma.purgeQueue.update({
      where: { id: queueId },
      data: {
        status: 'approved',
        approvedBy: actor.id,
        approvedAt: new Date(),
      },
    });

    // Eksekusi pemusnahan logis (metadata) — penghapusan fisik/backup = Phase 2.
    await this.prisma.document.update({
      where: { id: queue.documentId },
      data: {
        purgedAt: new Date(),
        status: DocStatus.deleted,
        retentionExpiresAt: null,
      },
    });
    await this.prisma.purgeQueue.update({
      where: { id: queueId },
      data: { status: 'purged', purgedAt: new Date() },
    });

    await this.audit.log({
      schoolId: queue.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'purge',
      entityType: 'PurgeQueue',
      entityId: queueId,
      metadata: { approved: true, note: dto.note },
    });
    return approved;
  }

  async reject(queueId: string, userId: string, dto: RejectPurgeDto) {
    const queue = await this.prisma.purgeQueue.findUnique({
      where: { id: queueId },
    });
    if (!queue) throw new NotFoundException('Antrean pemusnahan tidak ditemukan');
    const actor = await this.access.assertRole(userId, queue.schoolId, ADMIN);

    await this.prisma.$transaction([
      this.prisma.purgeQueue.update({
        where: { id: queueId },
        data: { status: 'rejected' },
      }),
      this.prisma.document.update({
        where: { id: queue.documentId },
        data: { status: DocStatus.active },
      }),
    ]);

    await this.audit.log({
      schoolId: queue.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'restore',
      entityType: 'PurgeQueue',
      entityId: queueId,
      metadata: { rejected: true, reason: dto.reason },
    });
    return { success: true, status: 'rejected' };
  }

  /** Antre semua dokumen kedaluwarsa di sekolah ini. */
  async enqueueAll(schoolId: string, userId: string, force = false) {
    await this.access.assertRole(userId, schoolId, ADMIN);
    return this.enqueueExpired(schoolId, userId);
  }

  /** Run scheduler untuk semua sekolah (atau sesuai konfigurasi). */
  async runScheduler(userId: string) {
    // Minimal: hanya admin sistem? Di sini cukup membership valid; but keep safe
    const now = new Date();
    const schools = await this.prisma.school.findMany({
      where: { deletedAt: null, status: 'active', retentionAutoEnqueue: true },
      select: { id: true },
    });
    let totalEnqueued = 0;
    let totalScanned = 0;
    for (const s of schools) {
      const r = await this.enqueueExpiredInternal(s.id);
      totalEnqueued += r.enqueued;
      totalScanned += r.scanned;
    }
    await this.audit.log({
      schoolId: null,
      actorUserId: userId,
      action: AuditAction.update,
      entityType: 'RetentionScheduler',
      metadata: { totalEnqueued, totalScanned, ranAt: now },
    } as any);
    return { ranAt: now, schools: schools.length, totalEnqueued, totalScanned };
  }

  private async enqueueExpiredInternal(schoolId: string) {
    const now = new Date();
    const expired = await this.prisma.document.findMany({
      where: {
        schoolId,
        deletedAt: null,
        purgedAt: null,
        isLegalHold: false,
        retentionExpiresAt: { lte: now },
        status: 'active',
      },
      take: 1000,
    });
    let enqueued = 0;
    for (const doc of expired) {
      const existing = await this.prisma.purgeQueue.findFirst({
        where: { documentId: doc.id, status: { in: ['pending', 'scheduled'] } },
      });
      if (existing) continue;
      await this.prisma.purgeQueue.create({
        data: {
          schoolId,
          documentId: doc.id,
          reason: 'retention_expired',
          scheduledPurgeAt: now,
          triggeredBy: 'auto',
        },
      });
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: DocStatus.pending_deletion },
      });
      enqueued += 1;
    }
    return { scanned: expired.length, enqueued };
  }
}
