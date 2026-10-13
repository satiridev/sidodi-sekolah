import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { ComplianceService } from '../compliance/compliance.service';

/** Role yang boleh melihat metrik satu sekolah. */
const SCHOOL_ROLES: UserRole[] = [
  'headmaster',
  'head_of_administration',
  'auditor',
];

/** Role yang boleh melihat metrik lintas sekolah (yayasan/dinas). */
const NETWORK_ROLES: UserRole[] = ['headmaster', 'auditor'];

/** Jumlah bulan tren unggahan yang dikembalikan. */
const TREND_MONTHS = 6;

/** Ambang "dokumen mendekati retensi" (hari). */
const NEARING_RETENTION_DAYS = 90;

/** Kunci bulan (YYYY-MM) untuk `TREND_MONTHS` bulan terakhir (termasuk bulan kini). */
function monthKeys(count: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

/** Awal rentang tren (awal bulan paling lama). */
function trendSince(count: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1), 1),
  );
}

/** Rekap baris bertanggal menjadi tren bulanan. */
function bucketTrend(
  rows: Array<{ createdAt: Date }>,
  count: number,
): Array<{ month: string; count: number }> {
  const keys = monthKeys(count);
  const map = new Map(keys.map((key) => [key, 0]));
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 7);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return keys.map((month) => ({ month, count: map.get(month) ?? 0 }));
}

function complianceStatus(score: number): string {
  return score >= 80 ? 'baik' : score >= 60 ? 'cukup' : 'perlu_perbaikan';
}

/** Persentase pemakaian storage (0..100, dua desimal). */
function storagePercent(used: bigint, quota: bigint): number {
  if (quota <= 0n) return 0;
  return Number((used * 10000n) / quota) / 100;
}

/**
 * Analitik lintas sekolah: metrik per sekolah (skor kepatuhan, storage,
 * dokumen mendekati retensi, tren unggahan) serta agregasi anonim lintas tenant
 * untuk yayasan/dinas (hanya sekolah yang *opt-in*).
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly compliance: ComplianceService,
  ) {}

  // ---------- Metrik per sekolah ----------

  async schoolMetrics(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, SCHOOL_ROLES);

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
    });
    if (!school) throw new NotFoundException('Sekolah tidak ditemukan');

    const now = new Date();
    const nearingBoundary = new Date(
      now.getTime() + NEARING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const [
      compliance,
      totalDocs,
      activeDocs,
      archivedDocs,
      pendingDeletion,
      legalHold,
      expiredRetention,
      nearingRetention,
      folders,
      membershipsActive,
      membershipsTotal,
      studentsActive,
      studentsGraduated,
      versions,
      typeGroups,
      docTypes,
      trendRows,
      snapshots,
    ] = await Promise.all([
      this.compliance.compute(schoolId, userId),
      this.prisma.document.count({ where: { schoolId, deletedAt: null } }),
      this.prisma.document.count({
        where: { schoolId, deletedAt: null, status: 'active' },
      }),
      this.prisma.document.count({
        where: { schoolId, deletedAt: null, status: 'archived' },
      }),
      this.prisma.document.count({
        where: { schoolId, deletedAt: null, status: 'pending_deletion' },
      }),
      this.prisma.document.count({
        where: { schoolId, deletedAt: null, isLegalHold: true },
      }),
      this.prisma.document.count({
        where: {
          schoolId,
          deletedAt: null,
          purgedAt: null,
          retentionExpiresAt: { lte: now },
        },
      }),
      this.prisma.document.count({
        where: {
          schoolId,
          deletedAt: null,
          purgedAt: null,
          retentionExpiresAt: { gt: now, lte: nearingBoundary },
        },
      }),
      this.prisma.folder.count({ where: { schoolId } }),
      this.prisma.membership.count({ where: { schoolId, status: 'active' } }),
      this.prisma.membership.count({ where: { schoolId } }),
      this.prisma.student.count({ where: { schoolId, status: 'active' } }),
      this.prisma.student.count({ where: { schoolId, status: 'graduated' } }),
      this.prisma.documentVersion.findMany({
        where: { document: { schoolId, deletedAt: null } },
        select: { sizeBytes: true },
      }),
      this.prisma.document.groupBy({
        by: ['documentTypeId'],
        where: { schoolId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.documentType.findMany({
        where: { OR: [{ schoolId }, { schoolId: null }] },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.documentVersion.findMany({
        where: {
          document: { schoolId, deletedAt: null },
          createdAt: { gte: trendSince(TREND_MONTHS) },
        },
        select: { createdAt: true },
      }),
      this.prisma.complianceSnapshot.findMany({
        where: { schoolId },
        orderBy: { computedAt: 'desc' },
        take: 12,
        select: { score: true, computedAt: true },
      }),
    ]);

    const totalSizeBytes = versions.reduce(
      (acc, version) => acc + version.sizeBytes,
      0n,
    );
    const typeNameById = new Map(docTypes.map((type) => [type.id, type]));
    const documentTypes = typeGroups
      .map((group) => {
        const type = group.documentTypeId
          ? typeNameById.get(group.documentTypeId)
          : undefined;
        return {
          id: group.documentTypeId,
          name: type?.name ?? 'Tanpa jenis',
          code: type?.code ?? null,
          count: group._count._all,
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      generatedAt: now,
      school: {
        id: school.id,
        name: school.name,
        planCode: school.planCode,
        status: school.status,
        analyticsOptIn: school.analyticsOptIn,
        createdAt: school.createdAt,
      },
      compliance: {
        score: compliance.score,
        status: compliance.status,
        checks: compliance.checks.map((check) => ({
          code: check.code,
          label: check.label,
          score: check.score,
          pass: check.pass,
        })),
        trend: snapshots
          .map((snapshot) => ({
            score: Number(snapshot.score),
            computedAt: snapshot.computedAt,
          }))
          .reverse(),
      },
      storage: {
        usedBytes: school.storageUsedBytes,
        quotaBytes: school.storageQuotaBytes,
        remainingBytes: school.storageQuotaBytes - school.storageUsedBytes,
        usagePercent: Number(
          storagePercent(
            school.storageUsedBytes,
            school.storageQuotaBytes,
          ).toFixed(2),
        ),
        maxFileSizeBytes: school.maxFileSizeBytes,
      },
      documents: {
        total: totalDocs,
        active: activeDocs,
        archived: archivedDocs,
        pendingDeletion,
        legalHold,
        expiredRetention,
        nearingRetention,
      },
      folders,
      memberships: { total: membershipsTotal, active: membershipsActive },
      students: { active: studentsActive, graduated: studentsGraduated },
      uploads: {
        totalVersions: versions.length,
        totalSizeBytes,
        trend: bucketTrend(trendRows, TREND_MONTHS),
      },
      documentTypes,
    };
  }

  // ---------- Metrik lintas sekolah (yayasan/dinas) ----------

  /**
   * Agregasi anonim lintas tenant. Hanya sekolah dengan `analyticsOptIn = true`
   * yang disertakan; respons tidak memuat identitas sekolah mana pun.
   * Pemanggil harus berperan kepala sekolah/auditor di minimal satu sekolah aktif.
   */
  async networkMetrics(userId: string) {
    const privileged = await this.prisma.membership.findMany({
      where: {
        userId,
        status: 'active',
        role: { in: NETWORK_ROLES },
        school: { status: 'active', deletedAt: null },
      },
      select: { schoolId: true },
    });
    if (privileged.length === 0) {
      throw new ForbiddenException(
        'Hanya kepala sekolah/auditor aktif yang dapat melihat metrik lintas sekolah',
      );
    }

    const schools = await this.prisma.school.findMany({
      where: { analyticsOptIn: true, status: 'active', deletedAt: null },
      select: {
        id: true,
        planCode: true,
        storageUsedBytes: true,
        storageQuotaBytes: true,
      },
    });

    const empty = {
      generatedAt: new Date(),
      scope: 'network',
      schools: { optedIn: 0, byPlan: [] as unknown[] },
      storage: {
        usedBytes: 0n,
        quotaBytes: 0n,
        remainingBytes: 0n,
        usagePercent: 0,
      },
      documents: { total: 0, legalHold: 0 },
      memberships: { active: 0 },
      students: { active: 0 },
      compliance: {
        schoolsWithScore: 0,
        averageScore: null as number | null,
        distribution: [] as unknown[],
      },
      uploads: { trend: bucketTrend([], TREND_MONTHS) },
    };
    if (schools.length === 0) return empty;

    const ids = schools.map((school) => school.id);

    const [
      totalDocs,
      legalHold,
      membershipsActive,
      studentsActive,
      trendRows,
      snapshots,
      plans,
    ] = await Promise.all([
      this.prisma.document.count({
        where: { schoolId: { in: ids }, deletedAt: null },
      }),
      this.prisma.document.count({
        where: { schoolId: { in: ids }, deletedAt: null, isLegalHold: true },
      }),
      this.prisma.membership.count({
        where: { schoolId: { in: ids }, status: 'active' },
      }),
      this.prisma.student.count({
        where: { schoolId: { in: ids }, status: 'active' },
      }),
      this.prisma.documentVersion.findMany({
        where: {
          document: { schoolId: { in: ids }, deletedAt: null },
          createdAt: { gte: trendSince(TREND_MONTHS) },
        },
        select: { createdAt: true },
      }),
      this.prisma.complianceSnapshot.findMany({
        where: { schoolId: { in: ids } },
        orderBy: { computedAt: 'desc' },
        select: { schoolId: true, score: true },
      }),
      this.prisma.plan.findMany({ select: { code: true, name: true } }),
    ]);

    // Skor kepatuhan terbaru per sekolah (snapshot = materialized view).
    const latestBySchool = new Map<string, number>();
    for (const snapshot of snapshots) {
      if (!latestBySchool.has(snapshot.schoolId)) {
        latestBySchool.set(snapshot.schoolId, Number(snapshot.score));
      }
    }
    const scores = [...latestBySchool.values()];
    const averageScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
          100
        : null;
    const bands = { baik: 0, cukup: 0, perlu_perbaikan: 0 };
    for (const score of scores) {
      bands[complianceStatus(score) as keyof typeof bands] += 1;
    }

    const totalUsed = schools.reduce(
      (acc, school) => acc + school.storageUsedBytes,
      0n,
    );
    const totalQuota = schools.reduce(
      (acc, school) => acc + school.storageQuotaBytes,
      0n,
    );

    const planName = new Map<string, string>(
      plans.map((plan) => [plan.code as string, plan.name]),
    );
    const planCounts = new Map<string, number>();
    for (const school of schools) {
      planCounts.set(school.planCode, (planCounts.get(school.planCode) ?? 0) + 1);
    }

    return {
      generatedAt: new Date(),
      scope: 'network',
      schools: {
        optedIn: schools.length,
        byPlan: [...planCounts.entries()]
          .map(([plan, count]) => ({
            plan,
            planName: planName.get(plan) ?? plan,
            count,
          }))
          .sort((a, b) => a.plan.localeCompare(b.plan)),
      },
      storage: {
        usedBytes: totalUsed,
        quotaBytes: totalQuota,
        remainingBytes: totalQuota - totalUsed,
        usagePercent: Number(storagePercent(totalUsed, totalQuota).toFixed(2)),
      },
      documents: { total: totalDocs, legalHold },
      memberships: { active: membershipsActive },
      students: { active: studentsActive },
      compliance: {
        schoolsWithScore: scores.length,
        averageScore,
        distribution: [
          { status: 'baik', count: bands.baik },
          { status: 'cukup', count: bands.cukup },
          { status: 'perlu_perbaikan', count: bands.perlu_perbaikan },
        ],
      },
      uploads: { trend: bucketTrend(trendRows, TREND_MONTHS) },
    };
  }
}
