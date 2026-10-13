import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { computeRetention } from '../common/retention';
import {
  CheckDuplicateDto,
  CreateDocumentDto,
  ListDocumentsDto,
  PolicyValidateDto,
  SchedulePurgeDto,
  SetLegalHoldDto,
  UpdateDocumentDto,
} from './dto/document.dto';
import { validateFilePolicy } from '../common/policy';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async list(schoolId: string, userId: string, query: ListDocumentsDto) {
    await this.access.membership(userId, schoolId);

    const where: Record<string, unknown> = {
      schoolId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.folderId ? { folderId: query.folderId } : {}),
      ...(query.documentTypeId ? { documentTypeId: query.documentTypeId } : {}),
      ...(query.tags?.length
        ? { tags: { hasEvery: query.tags } }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    let OR: Record<string, unknown> | undefined;
    if (query.q) {
      OR = {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
          { tags: { has: query.q } },
        ],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where: { ...where, ...OR },
        include: {
          documentType: true,
          folder: { select: { id: true, name: true, path: true } },
          currentVersion: {
            select: {
              id: true, fileName: true, mimeType: true, sizeBytes: true,
              contentHash: true, scanStatus: true, versionNumber: true,
            },
          },
          owner: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.document.count({ where: { ...where, ...OR } }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async create(userId: string, dto: CreateDocumentDto) {
    const actor = await this.access.assertRole(userId, dto.schoolId, [
      'headmaster',
      'head_of_administration',
      'operator',
      'teacher',
    ]);
    await this.assertFolderValid(dto.schoolId, dto.folderId);

    const docType = dto.documentTypeId
      ? await this.prisma.documentType.findUnique({
          where: { id: dto.documentTypeId },
        })
      : null;
    if (dto.documentTypeId && (!docType || (docType.schoolId && docType.schoolId !== dto.schoolId))) {
      throw new BadRequestException('Jenis dokumen tidak valid untuk sekolah ini');
    }

    const retention = computeRetention({
      retentionType: dto.retentionType,
      retentionExpiresAt: dto.retentionExpiresAt
        ? new Date(dto.retentionExpiresAt)
        : null,
      docTypeRetentionType: docType?.retentionType,
      docTypeRetentionMonths: docType?.retentionMonths ?? null,
    });

    const document = await this.prisma.document.create({
      data: {
        schoolId: dto.schoolId,
        folderId: dto.folderId,
        documentTypeId: dto.documentTypeId,
        title: dto.title,
        description: dto.description,
        visibility: dto.visibility ?? 'school',
        tags: dto.tags ?? [],
        retentionType: retention.retentionType,
        retentionExpiresAt: retention.retentionExpiresAt,
        ownerMembershipId: actor.id,
      },
    });

    await this.audit.log({
      schoolId: dto.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'Document',
      entityId: document.id,
    });
    return document;
  }

  private async assertFolderValid(schoolId: string, folderId?: string) {
    if (!folderId) return;
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
    });
    if (!folder || folder.schoolId !== schoolId) {
      throw new BadRequestException('Folder tidak valid untuk sekolah ini');
    }
  }

  private async loadDocument(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Dokumen tidak ditemukan');
    }
    return doc;
  }

  private canView(role: string, isOwner: boolean, visibility: string): boolean {
    if (visibility === 'school') return true;
    if (role === 'auditor' || role === 'headmaster' || role === 'head_of_administration') return true;
    if (visibility === 'classroom' && (role === 'teacher' || role === 'operator')) return true;
    if (isOwner) return true;
    return false;
  }

  async get(id: string, userId: string) {
    const doc = await this.loadDocument(id);
    const membership = await this.access.membership(userId, doc.schoolId);
    if (!this.canView(membership.role, membership.id === doc.ownerMembershipId, doc.visibility)) {
      throw new ForbiddenException('Tidak dapat mengakses dokumen ini');
    }
    const full = await this.prisma.document.findUnique({
      where: { id },
      include: {
        documentType: true,
        folder: true,
        currentVersion: true,
        owner: { include: { user: { select: { id: true, name: true, email: true } } } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true, versionNumber: true, fileName: true, mimeType: true,
            sizeBytes: true, contentHash: true, scanStatus: true, createdAt: true,
            uploadedBy: { include: { user: { select: { name: true } } } },
          },
        },
      },
    });
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: membership.id,
      action: 'view',
      entityType: 'Document',
      entityId: id,
    });
    return full;
  }

  async update(id: string, userId: string, dto: UpdateDocumentDto) {
    const doc = await this.loadDocument(id);
    const actor = await this.access.membership(userId, doc.schoolId);
    const isOwner = actor.id === doc.ownerMembershipId;
    const isAdmin = ['headmaster', 'head_of_administration', 'operator', 'auditor'].includes(actor.role);
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Hanya pemilik atau admin yang dapat mengubah dokumen');
    }
    if (dto.folderId) await this.assertFolderValid(doc.schoolId, dto.folderId);

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        folderId: dto.folderId,
        visibility: dto.visibility,
        tags: dto.tags,
      },
    });
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'Document',
      entityId: id,
    });
    return updated;
  }

  async remove(id: string, userId: string) {
    const doc = await this.loadDocument(id);
    const actor = await this.access.membership(userId, doc.schoolId);
    const isOwner = actor.id === doc.ownerMembershipId;
    const isAdmin = ['headmaster', 'head_of_administration', 'operator'].includes(actor.role);
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Tidak punya izin menghapus dokumen ini');
    }
    const updated = await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), status: DocStatus.deleted },
    });
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'delete',
      entityType: 'Document',
      entityId: id,
    });
    return updated;
  }

  async restore(id: string, userId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Dokumen tidak ditemukan');
    const actor = await this.access.membership(userId, doc.schoolId);
    const isAdmin = ['headmaster', 'head_of_administration', 'operator'].includes(actor.role);
    if (!isAdmin) {
      throw new ForbiddenException('Hanya admin yang dapat memulihkan dokumen');
    }
    const updated = await this.prisma.document.update({
      where: { id },
      data: { deletedAt: null, status: DocStatus.active },
    });
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'restore',
      entityType: 'Document',
      entityId: id,
    });
    return updated;
  }

  async download(id: string, userId: string) {
    const doc = await this.loadDocument(id);
    const membership = await this.access.membership(userId, doc.schoolId);
    if (!this.canView(membership.role, membership.id === doc.ownerMembershipId, doc.visibility)) {
      throw new ForbiddenException('Tidak dapat mengakses dokumen ini');
    }
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: doc.currentVersionId ?? '' },
    });
    if (!version) {
      throw new NotFoundException('Dokumen belum memiliki file');
    }
    const url = await this.storage.presignedGet(version.storageKey);
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: membership.id,
      action: 'download',
      entityType: 'Document',
      entityId: id,
      metadata: { versionId: version.id },
    });
    return { url, expiresIn: 900, fileName: version.fileName, sizeBytes: version.sizeBytes };
  }

  /**
   * Resolusi path file lokal untuk streaming (mode development tanpa S3).
   * Memverifikasi bahwa key milik dokumen di sekolah yang sama dengan pemanggil.
   */
  async resolveLocalFile(key: string, userId: string): Promise<string> {
    if (!key || !this.storage.localExists(key)) {
      throw new NotFoundException('File tidak ditemukan');
    }
    const version = await this.prisma.documentVersion.findFirst({
      where: { storageKey: key },
      include: { document: { select: { schoolId: true } } },
    });
    if (!version) {
      throw new NotFoundException('File tidak ditemukan');
    }
    await this.access.membership(userId, version.document.schoolId);
    return this.storage.localPath(key);
  }

  async versions(id: string, userId: string) {
    const doc = await this.loadDocument(id);
    const membership = await this.access.membership(userId, doc.schoolId);
    if (!this.canView(membership.role, membership.id === doc.ownerMembershipId, doc.visibility)) {
      throw new ForbiddenException('Tidak dapat mengakses dokumen ini');
    }
    return this.prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { versionNumber: 'desc' },
      include: {
        uploadedBy: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  }

  async auditTrail(id: string, userId: string) {
    const doc = await this.loadDocument(id);
    const membership = await this.access.membership(userId, doc.schoolId);
    if (membership.role !== 'auditor' && membership.role !== 'headmaster' && membership.role !== 'head_of_administration') {
      throw new ForbiddenException('Hanya auditor/admin yang dapat melihat jejak audit');
    }
    return this.prisma.auditLog.findMany({
      where: { entityType: 'Document', entityId: id, schoolId: doc.schoolId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        actorUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async checkDuplicate(userId: string, dto: CheckDuplicateDto) {
    await this.access.membership(userId, dto.schoolId);
    const existing = await this.prisma.documentVersion.findFirst({
      where: {
        contentHash: dto.contentHash,
        document: { schoolId: dto.schoolId, deletedAt: null, purgedAt: null },
      },
      orderBy: { createdAt: 'asc' },
      include: { document: { include: { currentVersion: true } } },
    });
    return {
      isDuplicate: Boolean(existing),
      existingDocument: existing ? { id: existing.documentId, title: existing.document.title, contentHash: existing.contentHash } : null,
    };
  }

  async validatePolicy(userId: string, dto: PolicyValidateDto) {
    await this.access.membership(userId, dto.schoolId);
    const school = await this.prisma.school.findUnique({
      where: { id: dto.schoolId },
    });
    let allowedExtensions: string[] | null = null;
    if (dto.documentTypeId) {
      const docType = await this.prisma.documentType.findUnique({
        where: { id: dto.documentTypeId },
      });
      if (docType) allowedExtensions = docType.allowedExtensions;
    }
    const sizeBytes = Number(dto.sizeBytes);
    const result = validateFilePolicy({
      fileName: dto.fileName,
      sizeBytes,
      allowedExtensions,
      maxSizeBytes: school?.maxFileSizeBytes ?? null,
    });
    return { allowed: result.allowed, reasons: result.reasons };
  }

  async setLegalHold(id: string, userId: string, dto: SetLegalHoldDto) {
    const doc = await this.loadDocument(id);
    const actor = await this.access.assertRole(userId, doc.schoolId, [
      'headmaster',
      'head_of_administration',
      'auditor',
    ]);
    if (dto.isLegalHold && !dto.reason) {
      throw new BadRequestException('Alasan legal hold wajib diisi');
    }
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        isLegalHold: dto.isLegalHold,
        legalHoldReason: dto.isLegalHold ? dto.reason : null,
        legalHoldBy: dto.isLegalHold ? actor.id : null,
        legalHoldAt: dto.isLegalHold ? new Date() : null,
      },
    });
    if (dto.isLegalHold) {
      await this.prisma.purgeQueue.deleteMany({
        where: { documentId: id, status: 'pending' },
      });
    }
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'legal_hold',
      entityType: 'Document',
      entityId: id,
      metadata: { isLegalHold: dto.isLegalHold, reason: dto.reason },
    });
    return updated;
  }

  async schedulePurge(id: string, userId: string, dto: SchedulePurgeDto) {
    const doc = await this.loadDocument(id);
    const actor = await this.access.assertRole(userId, doc.schoolId, [
      'headmaster',
      'head_of_administration',
    ]);
    if (doc.isLegalHold) {
      throw new BadRequestException('Dokumen dalam legal hold tidak dapat dijadwalkan pemusnahan');
    }
    const queue = await this.prisma.purgeQueue.create({
      data: {
        schoolId: doc.schoolId,
        documentId: id,
        reason: 'manual',
        scheduledPurgeAt: new Date(dto.scheduledPurgeAt),
        triggeredBy: 'manual',
        reviewedBy: actor.id,
      },
    });
    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.pending_deletion },
    });
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'purge',
      entityType: 'Document',
      entityId: id,
      metadata: { scheduled: true, purgeQueueId: queue.id },
    });
    return queue;
  }

  async cancelPurge(id: string, userId: string) {
    const doc = await this.loadDocument(id);
    const actor = await this.access.assertRole(userId, doc.schoolId, [
      'headmaster',
      'head_of_administration',
    ]);
    await this.prisma.purgeQueue.deleteMany({
      where: { documentId: id, status: 'pending' },
    });
    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.active },
    });
    await this.audit.log({
      schoolId: doc.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'restore',
      entityType: 'Document',
      entityId: id,
      metadata: { purgeCancelled: true },
    });
    return { success: true };
  }
}