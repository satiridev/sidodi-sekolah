import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSchoolDto,
  UpdateSchoolDto,
  UpdateSchoolSettingsDto,
} from './dto/school.dto';

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'sekolah';
}

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateSchoolDto) {
    let slug = dto.slug?.trim().toLowerCase() ?? slugify(dto.name);
    const existing = await this.prisma.school.findUnique({ where: { slug } });
    if (existing) {
      if (dto.slug) {
        throw new ConflictException('Slug sudah digunakan');
      }
      slug = `${slug}-${randomBytes(3).toString('hex')}`;
    }

    const plan = await this.prisma.plan.findUnique({ where: { code: 'trial' } });

    const { school, membership } = await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: dto.name,
          slug,
          npsn: dto.npsn,
          address: dto.address,
          city: dto.city,
          province: dto.province,
          phone: dto.phone,
          email: dto.email,
          planCode: 'trial',
          storageQuotaBytes: plan?.storageQuotaBytes ?? 5_000_000_000n,
          maxFileSizeBytes: 104_857_600n,
          status: 'active',
        },
      });

      const membership = await tx.membership.create({
        data: {
          schoolId: school.id,
          userId,
          role: 'headmaster',
          status: 'active',
          joinedAt: new Date(),
        },
      });

      const startedAt = new Date();
      const currentPeriodEnd = new Date(startedAt);
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

      await tx.subscription.create({
        data: {
          schoolId: school.id,
          planCode: 'trial',
          status: 'active',
          startedAt,
          currentPeriodEnd,
        },
      });

      // Aturan retensi default mengikuti jenis dokumen sistem (school_id NULL)
      // sehingga sekolah baru langsung punya kebijakan retensi yang siap pakai.
      const systemTypes = await tx.documentType.findMany({
        where: { schoolId: null },
        select: { id: true, retentionMonths: true },
      });
      if (systemTypes.length > 0) {
        await tx.retentionRule.createMany({
          data: systemTypes.map((type) => ({
            schoolId: school.id,
            documentTypeId: type.id,
            retentionMonths: type.retentionMonths,
            action: 'purge' as const,
            notifyDaysBefore: [30, 7, 1],
            requiresApproval: true,
            isActive: true,
          })),
        });
      }

      return { school, membership };
    });

    // Audit ditulis setelah transaksi commit agar FK school_id valid.
    await this.audit.log({
      schoolId: school.id,
      actorUserId: userId,
      actorMembershipId: membership.id,
      action: 'create',
      entityType: 'School',
      entityId: school.id,
    });

    return school;
  }

  async getById(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        _count: {
          select: {
            memberships: true,
            documents: { where: { deletedAt: null } },
            folders: true,
          },
        },
      },
    });
    if (!school) throw new NotFoundException('Sekolah tidak ditemukan');
    return school;
  }

  async getBySlug(slug: string) {
    const school = await this.prisma.school.findUnique({
      where: { slug },
      include: { _count: { select: { memberships: true, documents: true } } },
    });
    if (!school) throw new NotFoundException('Sekolah tidak ditemukan');
    return school;
  }

  async update(schoolId: string, userId: string, dto: UpdateSchoolDto) {
    await this.access.assertRole(userId, schoolId, [
      'head_of_administration',
      'operator',
    ]);
    const school = await this.prisma.school.update({
      where: { id: schoolId },
      data: { ...dto },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'School',
      entityId: schoolId,
    });
    return school;
  }

  async updateSettings(
    schoolId: string,
    userId: string,
    dto: UpdateSchoolSettingsDto,
  ) {
    await this.access.assertRole(userId, schoolId, [
      'head_of_administration',
    ]);
    const school = await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        maxFileSizeBytes: dto.maxFileSizeBytes
          ? BigInt(dto.maxFileSizeBytes)
          : undefined,
        storageQuotaBytes: dto.quotaBytes
          ? BigInt(dto.quotaBytes)
          : undefined,
      },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'SchoolSettings',
      entityId: schoolId,
    });
    return school;
  }

  async storage(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });
    if (!school) throw new NotFoundException('Sekolah tidak ditemukan');

    const usedBytes = school.storageUsedBytes;
    const quotaBytes = school.storageQuotaBytes;
    const usagePercent =
      quotaBytes > 0n ? Number(((usedBytes * 10000n) / quotaBytes) / 100n) : 0;

    return {
      quotaBytes,
      usedBytes,
      remainingBytes: quotaBytes - usedBytes,
      usagePercent: Number(usagePercent.toFixed(2)),
      maxFileSizeBytes: school.maxFileSizeBytes,
    };
  }
}