import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import JSZip from 'jszip';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateFinanceArchiveDto,
  FinanceExportDto,
  FinanceSummaryDto,
  ListFinanceArchivesDto,
} from './dto/finance.dto';

/** Role yang boleh menambah arsip keuangan. */
const MANAGE_ROLES: UserRole[] = [
  'headmaster',
  'head_of_administration',
  'operator',
];

/** Role yang boleh mengekspor paket audit (data sensitif). */
const EXPORT_ROLES: UserRole[] = [
  'headmaster',
  'head_of_administration',
  'auditor',
];

/** Sertakan relasi yang lazim dipakai UI/pelaporan. */
const ARCHIVE_INCLUDE: Prisma.FinanceArchiveInclude = {
  academicYear: { select: { id: true, name: true } },
  document: {
    select: {
      id: true,
      title: true,
      status: true,
      retentionExpiresAt: true,
      isLegalHold: true,
      documentType: { select: { name: true, code: true } },
      currentVersion: {
        select: { fileName: true, sizeBytes: true, contentHash: true },
      },
    },
  },
};

/** Bentuk satu entri pada `manifest.json` paket audit. */
interface AuditManifestEntry {
  id: string;
  category: string;
  amountIdr: string | null;
  academicYear: { id: string; name: string } | null;
  createdAt: Date;
  document: {
    id: string;
    title: string;
    status: string;
    documentType: string | null;
    documentTypeCode: string | null;
    retentionExpiresAt: Date | null;
    isLegalHold: boolean;
  } | null;
  file: {
    name: string;
    sizeBytes: string;
    contentHash: string;
    zipPath: string;
  } | null;
  note: string | null;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sekolah'
  );
}

/** Bersihkan nama berkas agar aman dipakai sebagai entri ZIP. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+/, '');
  return cleaned.slice(0, 120) || 'berkas';
}

/**
 * Modul Arsip Keuangan/BOS: pencatatan arsip keuangan bertaut dokumen,
 * ringkasan per tahun ajaran, dan ekspor paket audit (ZIP + manifest).
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Arsip ----------

  async listArchives(
    schoolId: string,
    userId: string,
    query: ListFinanceArchivesDto = {},
  ) {
    await this.access.membership(userId, schoolId);
    const where: Prisma.FinanceArchiveWhereInput = { schoolId };
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.category) where.category = query.category;

    return this.prisma.financeArchive.findMany({
      where,
      include: ARCHIVE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createArchive(
    schoolId: string,
    userId: string,
    dto: CreateFinanceArchiveDto,
  ) {
    await this.access.assertRole(userId, schoolId, MANAGE_ROLES);

    if (dto.academicYearId) {
      const year = await this.prisma.academicYear.findUnique({
        where: { id: dto.academicYearId },
        select: { schoolId: true },
      });
      if (!year || year.schoolId !== schoolId) {
        throw new BadRequestException(
          'Tahun ajaran tidak valid untuk sekolah ini',
        );
      }
    }

    if (dto.documentId) {
      const doc = await this.prisma.document.findUnique({
        where: { id: dto.documentId },
        select: { schoolId: true, deletedAt: true, purgedAt: true },
      });
      if (!doc || doc.schoolId !== schoolId) {
        throw new BadRequestException('Dokumen tidak valid untuk sekolah ini');
      }
      // Dokumen yang dihapus/dipurge tidak boleh ditautkan lagi; ekspor tidak
      // akan mampu membaca berkasnya.
      if (doc.deletedAt || doc.purgedAt) {
        throw new BadRequestException(
          'Dokumen sudah dihapus dan tidak dapat ditautkan',
        );
      }
    }

    const archive = await this.prisma.financeArchive.create({
      data: {
        schoolId,
        academicYearId: dto.academicYearId ?? null,
        category: dto.category,
        amountIdr: dto.amountIdr ?? null,
        documentId: dto.documentId ?? null,
      },
      include: ARCHIVE_INCLUDE,
    });

    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'create',
      entityType: 'FinanceArchive',
      entityId: archive.id,
      metadata: {
        category: dto.category,
        amountIdr: dto.amountIdr ?? null,
        academicYearId: dto.academicYearId ?? null,
        documentId: dto.documentId ?? null,
      },
    });
    return archive;
  }

  // ---------- Ringkasan ----------

  async summary(
    schoolId: string,
    userId: string,
    query: FinanceSummaryDto = {},
  ) {
    await this.access.membership(userId, schoolId);
    const where: Prisma.FinanceArchiveWhereInput = { schoolId };
    if (query.academicYearId) where.academicYearId = query.academicYearId;

    const archives = await this.prisma.financeArchive.findMany({
      where,
      select: {
        category: true,
        amountIdr: true,
        academicYearId: true,
        academicYear: { select: { name: true } },
      },
    });

    let total = new Prisma.Decimal(0);
    const byCategory = new Map<
      string,
      { count: number; total: Prisma.Decimal }
    >();
    const byYear = new Map<
      string,
      {
        academicYearId: string | null;
        academicYearName: string | null;
        count: number;
        total: Prisma.Decimal;
      }
    >();

    for (const archive of archives) {
      const amount = archive.amountIdr ?? new Prisma.Decimal(0);
      total = total.plus(amount);

      const category = byCategory.get(archive.category) ?? {
        count: 0,
        total: new Prisma.Decimal(0),
      };
      category.count += 1;
      category.total = category.total.plus(amount);
      byCategory.set(archive.category, category);

      const key = archive.academicYearId ?? '__none__';
      const year = byYear.get(key) ?? {
        academicYearId: archive.academicYearId,
        academicYearName: archive.academicYear?.name ?? null,
        count: 0,
        total: new Prisma.Decimal(0),
      };
      year.count += 1;
      year.total = year.total.plus(amount);
      byYear.set(key, year);
    }

    return {
      filters: { academicYearId: query.academicYearId ?? null },
      totalCount: archives.length,
      totalAmountIdr: total.toFixed(2),
      byCategory: [...byCategory.entries()]
        .map(([category, value]) => ({
          category,
          count: value.count,
          totalAmountIdr: value.total.toFixed(2),
        }))
        .sort((a, b) => a.category.localeCompare(b.category)),
      byAcademicYear: [...byYear.values()]
        .map((value) => ({
          academicYearId: value.academicYearId,
          academicYearName: value.academicYearName,
          count: value.count,
          totalAmountIdr: value.total.toFixed(2),
        }))
        .sort((a, b) =>
          (a.academicYearName ?? '').localeCompare(b.academicYearName ?? ''),
        ),
    };
  }

  // ---------- Ekspor paket audit ----------

  /**
   * Bangun paket audit berupa ZIP berisi `manifest.json`, `README.txt`, dan
   * salinan berkas dokumen yang tertaut ke arsip keuangan.
   */
  async exportPackage(
    schoolId: string,
    userId: string,
    query: FinanceExportDto = {},
  ) {
    await this.access.assertRole(userId, schoolId, EXPORT_ROLES);

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, npsn: true },
    });
    if (!school) throw new NotFoundException('Sekolah tidak ditemukan');

    const where: Prisma.FinanceArchiveWhereInput = { schoolId };
    if (query.academicYearId) where.academicYearId = query.academicYearId;

    const archives = await this.prisma.financeArchive.findMany({
      where,
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
      include: {
        academicYear: { select: { id: true, name: true } },
        document: {
          select: {
            id: true,
            title: true,
            status: true,
            retentionExpiresAt: true,
            isLegalHold: true,
            documentType: { select: { name: true, code: true } },
            currentVersion: {
              select: {
                storageKey: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
                contentHash: true,
              },
            },
          },
        },
      },
    });

    const zip = new JSZip();
    const filesFolder = zip.folder('files');
    const entries: AuditManifestEntry[] = [];
    let fileIndex = 0;
    let includedFiles = 0;
    let skippedFiles = 0;

    for (const archive of archives) {
      const entry: AuditManifestEntry = {
        id: archive.id,
        category: archive.category,
        amountIdr: archive.amountIdr ? archive.amountIdr.toFixed(2) : null,
        academicYear: archive.academicYear
          ? { id: archive.academicYear.id, name: archive.academicYear.name }
          : null,
        createdAt: archive.createdAt,
        document: archive.document
          ? {
              id: archive.document.id,
              title: archive.document.title,
              status: archive.document.status,
              documentType: archive.document.documentType?.name ?? null,
              documentTypeCode: archive.document.documentType?.code ?? null,
              retentionExpiresAt: archive.document.retentionExpiresAt,
              isLegalHold: archive.document.isLegalHold,
            }
          : null,
        file: null,
        note: null,
      };

      const version = archive.document?.currentVersion;
      if (!archive.document) {
        entry.note = 'Tidak ada dokumen tertaut';
      } else if (!version) {
        entry.note = 'Dokumen belum memiliki berkas';
      } else {
        fileIndex += 1;
        const prefix = String(fileIndex).padStart(4, '0');
        const storedName = `${prefix}-${safeFileName(version.fileName)}`;
        try {
          // eslint-disable-next-line no-await-in-loop
          const buffer = await this.storage.getBuffer(version.storageKey);
          filesFolder?.file(storedName, buffer);
          entry.file = {
            name: version.fileName,
            sizeBytes: version.sizeBytes.toString(),
            contentHash: version.contentHash,
            zipPath: `files/${storedName}`,
          };
          includedFiles += 1;
        } catch {
          entry.note = 'Berkas tidak dapat dibaca dari penyimpanan';
          skippedFiles += 1;
        }
      }
      entries.push(entry);
    }

    const generatedAt = new Date().toISOString();
    const totalAmount = archives
      .reduce(
        (acc, archive) => acc.plus(archive.amountIdr ?? 0),
        new Prisma.Decimal(0),
      )
      .toFixed(2);

    const manifest = {
      format: 'arsip-sekolah-audit-v1',
      generatedAt,
      school: { id: school.id, name: school.name, npsn: school.npsn },
      filter: { academicYearId: query.academicYearId ?? null },
      totals: {
        archives: archives.length,
        files: includedFiles,
        skippedFiles,
        totalAmountIdr: totalAmount,
      },
      archives: entries,
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file(
      'README.txt',
      [
        `Paket audit arsip keuangan — ${school.name}`,
        `Dibuat: ${generatedAt}`,
        `Jumlah arsip: ${archives.length}`,
        `Berkas disertakan: ${includedFiles}`,
        `Berkas dilewati: ${skippedFiles}`,
        `Total nominal: Rp ${totalAmount}`,
        '',
        'Isi paket:',
        '- manifest.json : metadata arsip, tautan dokumen, dan daftar berkas.',
        '- files/        : salinan berkas dokumen yang tertaut.',
        '',
        'Catatan: berkas PDF/dokumen asli dapat berbeda dari versi terakhir',
        'bila dokumen memiliki beberapa versi. Silakan rujuk sistem untuk',
        'riwayat versi lengkap.',
      ].join('\n'),
    );

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    const stamp = generatedAt.slice(0, 10).replace(/-/g, '');
    const fileName = `paket-audit-${slugify(school.name)}-${stamp}.zip`;

    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'download',
      entityType: 'FinanceArchive',
      metadata: {
        format: 'zip',
        archives: archives.length,
        files: includedFiles,
        skippedFiles,
        academicYearId: query.academicYearId ?? null,
      },
    });

    return { buffer, fileName };
  }
}
