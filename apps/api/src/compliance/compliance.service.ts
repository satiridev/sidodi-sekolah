import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { getExtension } from '@arsip/shared';
import { BLOCKED_EXTENSIONS } from '@arsip/shared';

export interface ComplianceCheck {
  code: string;
  label: string;
  weight: number;
  score: number; // 0..1
  pass: boolean;
  detail: string;
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async compute(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, [
      'headmaster',
      'head_of_administration',
      'auditor',
      'operator',
    ]);
    const checks = await this.checks(schoolId);

    const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
    const raw = checks.reduce(
      (s, c) => s + c.weight * c.score * 100,
      0,
    ) / totalWeight;
    const score = Math.round(raw * 100) / 100;

    return {
      score,
      status: score >= 80 ? 'baik' : score >= 60 ? 'cukup' : 'perlu_perbaikan',
      generatedAt: new Date(),
      checks,
    };
  }

  private async checks(schoolId: string): Promise<ComplianceCheck[]> {
    const [
      school,
      docTotal,
      docsWithFolder,
      versionsTotal,
      expiredEnqueued,
      memberships,
      auditCount,
      skCount,
      policyVerdicts,
    ] = await this.prisma.$transaction([
      this.prisma.school.findUnique({ where: { id: schoolId } }),
      this.prisma.document.count({
        where: { schoolId, deletedAt: null, status: { in: ['active', 'archived'] } },
      }),
      this.prisma.document.count({
        where: { schoolId, folderId: { not: null }, deletedAt: null },
      }),
      this.prisma.documentVersion.count({
        where: { document: { schoolId, deletedAt: null } },
      }),
      this.prisma.document.count({
        where: {
          schoolId, purgedAt: null, deletedAt: null, status: { in: ['active', 'archived'] },
          retentionExpiresAt: { lte: new Date() },
        },
      }),
      this.prisma.membership.findMany({
        where: { schoolId, status: 'active' },
        select: { role: true },
      }),
      this.prisma.auditLog.count({ where: { schoolId } }),
      this.prisma.sKDocument.count({ where: { schoolId, isActive: true } }),
      this.prisma.documentVersion.findMany({
        where: { document: { schoolId, deletedAt: null } },
        select: { sizeBytes: true, extension: true },
        take: 500,
      }),
    ]);

    const checks: ComplianceCheck[] = [];

    // 1. Kebijakan file: versi yang lolos batas ukuran & ekstensi.
    const maxSize = Number(school?.maxFileSizeBytes ?? 0n);
    let compliantFiles = 0;
    for (const v of policyVerdicts) {
      const ext = v.extension.toLowerCase();
      const ok =
        Number(v.sizeBytes) <= maxSize &&
        !(BLOCKED_EXTENSIONS as readonly string[]).includes(ext);
      if (ok) compliantFiles += 1;
    }
    const fileRatio =
      versionsTotal > 0 ? compliantFiles / versionsTotal : 1;
    checks.push({
      code: 'kebijakan_file',
      label: 'Dokumen memenuhi kebijakan ukuran & ekstensi',
      weight: 20,
      score: fileRatio,
      pass: fileRatio >= 0.9,
      detail: `${compliantFiles}/${versionsTotal} file lolos kebijakan (maks ${Math.round(maxSize / 1048576)} MB)`,
    });

    // 2. Retensi terdefinisi.
    const docsWithRetention = await this.prisma.document.count({
      where: {
        schoolId, deletedAt: null, status: { in: ['active', 'archived'] },
        OR: [
          { retentionExpiresAt: { not: null } },
          { retentionType: 'academic_permanent' },
        ],
      },
    });
    const retentionRatio =
      docTotal > 0 ? docsWithRetention / docTotal : 1;
    checks.push({
      code: 'retensi_terdefinisi',
      label: 'Jadwal retensi terdefinisi setiap dokumen',
      weight: 20,
      score: retentionRatio,
      pass: retentionRatio >= 0.9,
      detail: `${docsWithRetention}/${docTotal} dokumen punya jadwal retensi`,
    });

    // 3. Struktur arsip.
    const folderRatio = docTotal > 0 ? docsWithFolder / docTotal : 1;
    checks.push({
      code: 'struktur_arsip',
      label: 'Dokumen tersimpan pada struktur folder',
      weight: 15,
      score: folderRatio,
      pass: folderRatio >= 0.9,
      detail: `${docsWithFolder}/${docTotal} dokumen ada di folder`,
    });

    // 4. Kontrol akses (RBAC).
    const roles = new Set(memberships.map((m) => m.role));
    const rolePoints =
      (roles.has('headmaster') ? 1 : 0) +
      (roles.has('head_of_administration') ? 1 : 0) +
      (roles.has('operator') ? 1 : 0) +
      (roles.has('teacher') ? 1 : 0) +
      (roles.has('auditor') ? 1 : 0);
    const accessScore = Math.min(rolePoints / 5, 1);
    checks.push({
      code: 'kontrol_akses',
      label: 'RBAC & pemisahan peran aktif',
      weight: 15,
      score: accessScore,
      pass: accessScore >= 0.6,
      detail: `${memberships.length} anggota aktif; ${rolePoints}/5 peran terisi`,
    });

    // 5. Jejak audit.
    const auditScore = Math.min(auditCount / 10, 1);
    checks.push({
      code: 'jejak_audit',
      label: 'Jejak audit terdokumentasi',
      weight: 15,
      score: auditScore,
      pass: auditScore >= 0.5,
      detail: `${auditCount} event tercatat`,
    });

    // 6. Legalitas (SK madrasah/sekolah).
    checks.push({
      code: 'legalitas_terarsip',
      label: 'SK legalitas & akreditasi terarsip',
      weight: 15,
      score: skCount > 0 ? 1 : 0,
      pass: skCount > 0,
      detail:
        skCount > 0
          ? `${skCount} SK tersimpan`
          : 'Belum ada SK; unggah SK mendirikan/izin operasional',
    });

    void expiredEnqueued;
    return checks;
  }

  async storeSnapshot(schoolId: string, userId: string) {
    const result = await this.compute(schoolId, userId);
    const last = await this.prisma.complianceSnapshot.findFirst({
      where: { schoolId },
      orderBy: { computedAt: 'desc' },
    });
    const oneHour = 60 * 60 * 1000;
    if (
      last &&
      Date.now() - new Date(last.computedAt).getTime() < oneHour
    ) {
      return this.history(schoolId, userId, 1);
    }
    await this.prisma.complianceSnapshot.create({
      data: {
        schoolId,
        score: result.score.toFixed(2),
        breakdown: result.checks as unknown as Prisma.InputJsonValue,
      },
    });
    return this.history(schoolId, userId, 1);
  }

  async history(schoolId: string, userId: string, limit = 12) {
    await this.access.membership(userId, schoolId);
    return this.prisma.complianceSnapshot.findMany({
      where: { schoolId },
      orderBy: { computedAt: 'desc' },
      take: limit,
    });
  }

  async csvReport(schoolId: string, userId: string): Promise<string> {
    const result = await this.compute(schoolId, userId);
    const rows = [
      ['check', 'label', 'skor', 'bobot', 'status'],
      ...result.checks.map((c) => [
        c.code,
        c.label,
        String(Math.round(c.score * 100)),
        String(c.weight),
        c.pass ? 'PASS' : 'FAIL',
      ]),
      [],
      ['skor_total', '', String(result.score), '', result.status],
      ['dihasilkan_pada', '', result.generatedAt.toISOString(), '', ''],
    ];
    return rows.map((r) => r.join(';')).join('\n');
  }
}