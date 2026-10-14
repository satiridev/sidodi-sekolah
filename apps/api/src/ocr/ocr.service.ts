import { Injectable, NotFoundException } from '@nestjs/common';
import { OcrStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { reindexDocument } from '../common/search-index';
import { ExtractionResult, extractText } from './text-extraction';

const OCR_OPERATOR: UserRole[] = [
  'headmaster',
  'head_of_administration',
  'operator',
];

interface OcrJobRow {
  id: string;
  documentVersionId: string;
  status: OcrStatus;
  language: string;
  error?: string | null;
}

@Injectable()
export class OcrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private maxBytes(): number {
    const configured = Number(process.env.OCR_MAX_BYTES);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : 50 * 1024 * 1024;
  }

  async enqueueForVersion(documentVersionId: string) {
    const pending = await this.prisma.ocrJob.findFirst({
      where: { documentVersionId, status: 'pending' },
    });
    if (pending) return pending;
    return this.prisma.ocrJob.create({
      data: { documentVersionId, status: 'pending', language: 'id' },
    });
  }

  async processJob(jobId: string): Promise<Record<string, unknown>> {
    const job = await this.prisma.ocrJob.findUnique({
      where: { id: jobId },
      include: { documentVersion: true },
    });
    if (!job) throw new NotFoundException('Pekerjaan OCR tidak ditemukan');
    if (job.status !== 'pending') return this.jobView(job);

    const version = job.documentVersion;
    await this.prisma.ocrJob.update({
      where: { id: job.id },
      data: { startedAt: new Date() },
    });

    let result: ExtractionResult;
    if (Number(version.sizeBytes) > this.maxBytes()) {
      result = {
        status: 'skipped',
        text: '',
        error: `Melebihi ambang ukuran OCR (${this.maxBytes()} byte)`,
      };
    } else {
      try {
        const buffer = await this.storage.getBuffer(version.storageKey);
        result = await extractText(buffer, version.mimeType, version.extension);
      } catch (error) {
        result = {
          status: 'failed',
          text: '',
          error: error instanceof Error ? error.message : 'Gagal membaca berkas',
        };
      }
    }

    await this.prisma.$transaction([
      this.prisma.documentVersion.update({
        where: { id: version.id },
        data: {
          ocrText: result.text || null,
          ocrStatus: result.status as OcrStatus,
        },
      }),
      this.prisma.ocrJob.update({
        where: { id: job.id },
        data: {
          status: result.status as OcrStatus,
          finishedAt: new Date(),
          error: result.error ?? null,
        },
      }),
    ]);

    if (result.status === 'done') {
      await reindexDocument(this.prisma, version.documentId);
    }

    return {
      ...this.jobView(job),
      status: result.status,
      error: result.error ?? null,
      textLength: result.text.length,
    };
  }

  async processPending(options: { schoolId?: string; limit?: number } = {}) {
    const jobs = await this.prisma.ocrJob.findMany({
      where: {
        status: 'pending',
        ...(options.schoolId
          ? { documentVersion: { document: { schoolId: options.schoolId } } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(options.limit ?? 50, 200),
    });

    const results: Array<Record<string, unknown>> = [];
    for (const job of jobs) {
      results.push(await this.processJob(job.id));
    }
    return { processed: results.length, results };
  }

  async runForSchool(schoolId: string, userId: string) {
    const actor = await this.access.assertRole(userId, schoolId, OCR_OPERATOR);
    const summary = await this.processPending({ schoolId });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'OcrJob',
      metadata: { processed: summary.processed },
    });
    return summary;
  }

  async reprocess(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { schoolId: true, deletedAt: true, currentVersionId: true },
    });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Dokumen tidak ditemukan');
    }
    const actor = await this.access.assertRole(userId, doc.schoolId, OCR_OPERATOR);
    if (!doc.currentVersionId) {
      throw new NotFoundException('Dokumen belum memiliki versi');
    }
    const job = await this.enqueueForVersion(doc.currentVersionId);
    const result = await this.processJob(job.id);
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'Document',
      entityId: documentId,
      metadata: { action: 'ocr_reprocess', status: result.status },
    });
    return result;
  }

  async getExtractedText(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { schoolId: true, deletedAt: true, currentVersion: { select: { id: true, ocrText: true, ocrStatus: true } } },
    });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Dokumen tidak ditemukan');
    }
    await this.access.membership(userId, doc.schoolId);
    return {
      documentId,
      versionId: doc.currentVersion?.id ?? null,
      status: doc.currentVersion?.ocrStatus ?? null,
      text: doc.currentVersion?.ocrText ?? '',
    };
  }

  async status(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { schoolId: true, deletedAt: true },
    });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Dokumen tidak ditemukan');
    }
    await this.access.membership(userId, doc.schoolId);
    return this.prisma.ocrJob.findMany({
      where: { documentVersion: { documentId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentVersionId: true,
        status: true,
        language: true,
        error: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
    });
  }

  private jobView(job: OcrJobRow) {
    return {
      id: job.id,
      documentVersionId: job.documentVersionId,
      status: job.status,
      language: job.language,
      error: job.error ?? null,
    };
  }
}
