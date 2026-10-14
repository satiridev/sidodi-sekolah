import { Injectable, NotFoundException } from '@nestjs/common';
import { BackupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { UpdateBackupConfigDto } from './dto/backups.dto';

@Injectable()
export class BackupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async getConfig(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration']);
    let cfg = await this.prisma.backupConfig.findFirst({ where: { schoolId } });
    if (!cfg) {
      cfg = await this.prisma.backupConfig.create({
        data: {
          schoolId,
          target: 'cloud',
          scheduleCron: '0 2 * * *',
          scope: 'full',
          retentionDays: 30,
          isActive: false,
        },
      });
    }
    return cfg;
  }

  async updateConfig(schoolId: string, userId: string, dto: UpdateBackupConfigDto) {
    const actor = await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration']);
    let cfg = await this.prisma.backupConfig.findFirst({ where: { schoolId } });
    if (!cfg) {
      cfg = await this.prisma.backupConfig.create({
        data: {
          schoolId,
          target: dto.target ?? 'cloud',
          scheduleCron: dto.scheduleCron ?? '0 2 * * *',
          scope: dto.scope ?? 'full',
          retentionDays: dto.retentionDays ?? 30,
          isActive: dto.isActive ?? false,
        },
      });
    } else {
      cfg = await this.prisma.backupConfig.update({
        where: { id: cfg.id },
        data: { ...dto },
      });
    }
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'BackupConfig',
      entityId: cfg.id,
    });
    return cfg;
  }

  async runManual(schoolId: string, userId: string) {
    const actor = await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration']);
    const job = await this.prisma.backupJob.create({
      data: { schoolId, status: 'queued' },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'BackupJob',
      entityId: job.id,
      metadata: { mode: 'manual' },
    });
    return job;
  }

  async listJobs(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration', 'auditor']);
    return this.prisma.backupJob.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
