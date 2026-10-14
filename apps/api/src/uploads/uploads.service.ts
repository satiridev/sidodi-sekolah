import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UploadStatus } from '@prisma/client';
import { getExtension } from '@arsip/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { computeRetention } from '../common/retention';
import { reindexDocument } from '../common/search-index';
import { validateFilePolicy } from '../common/policy';
import { InitiateUploadDto, PartUploadDto } from './dto/upload.dto';

function baseName(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async initiate(userId: string, dto: InitiateUploadDto) {
    const membership = await this.access.assertRole(userId, dto.schoolId, [
      'headmaster',
      'head_of_administration',
      'operator',
      'teacher',
    ]);

    let documentTypeId = dto.documentTypeId;
    if (dto.documentId) {
      const doc = await this.prisma.document.findUnique({
        where: { id: dto.documentId },
      });
      if (!doc || doc.deletedAt) {
        throw new NotFoundException('Dokumen tidak ditemukan');
      }
      if (doc.schoolId !== dto.schoolId) {
        throw new BadRequestException('Dokumen bukan milik sekolah ini');
      }
      documentTypeId = doc.documentTypeId ?? documentTypeId;
    } else if (dto.folderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: dto.folderId },
      });
      if (!folder || folder.schoolId !== dto.schoolId) {
        throw new BadRequestException('Folder tidak valid untuk sekolah ini');
      }
    }

    const docType = await this.validateDocumentType(
      dto.schoolId,
      documentTypeId,
    );

    const policy = validateFilePolicy({
      fileName: dto.fileName,
      sizeBytes: dto.sizeBytes,
      allowedExtensions: docType?.allowedExtensions ?? null,
      maxSizeBytes: (await this.schoolMaxSize(dto.schoolId)),
    });
    if (!policy.allowed) {
      throw new BadRequestException({
        error: 'POLICY_VIOLATION',
        message: policy.reasons.join('; '),
        details: policy.reasons,
      });
    }

    const session = await this.prisma.uploadSession.create({
      data: {
        schoolId: dto.schoolId,
        membershipId: membership.id,
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        sizeBytes: BigInt(dto.sizeBytes),
        status: 'initiated',
        documentId: dto.documentId,
        folderId: dto.folderId,
        documentTypeId,
        title: dto.title ?? baseName(dto.fileName),
        changeNote: dto.changeNote,
      },
    });

    return {
      id: session.id,
      status: session.status,
      uploadUrl: `/api/v1/uploads/${session.id}/content`,
      uploadMethod: 'POST',
      expiresIn: 3600,
      documentId: session.documentId,
      documentTypeId: session.documentTypeId,
    };
  }

  private async schoolMaxSize(schoolId: string): Promise<number | null> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { maxFileSizeBytes: true },
    });
    return school ? Number(school.maxFileSizeBytes) : null;
  }

  private async validateDocumentType(
    schoolId: string,
    documentTypeId?: string | null,
  ) {
    if (!documentTypeId) return null;
    const docType = await this.prisma.documentType.findUnique({
      where: { id: documentTypeId },
    });
    if (!docType || (docType.schoolId && docType.schoolId !== schoolId)) {
      throw new BadRequestException('Jenis dokumen tidak valid untuk sekolah ini');
    }
    return docType;
  }

  /** Terima file (multipart, field `file`). Mode lokal untuk development. */
  async content(
    uploadId: string,
    userId: string,
    file?: Express.Multer.File,
  ) {
    const session = await this.loadActive(uploadId, userId);
    if (!file || file.size === 0) {
      throw new BadRequestException('File kosong; kirim field multipart `file`');
    }

    const policy = validateFilePolicy({
      fileName: file.originalname,
      sizeBytes: file.size,
      allowedExtensions:
        (await this.validateDocumentType(session.schoolId, session.documentTypeId))
          ?.allowedExtensions ?? null,
      maxSizeBytes: await this.schoolMaxSize(session.schoolId),
    });
    if (!policy.allowed) {
      throw new BadRequestException({
        error: 'POLICY_VIOLATION',
        message: policy.reasons.join('; '),
        details: policy.reasons,
      });
    }

    const tempKey = `tmp/${uploadId}`;
    await this.storage.put(tempKey, file.buffer, file.mimetype);

    return {
      receivedBytes: file.size,
      fileName: file.originalname,
      mimeType: file.mimetype,
      next: `/api/v1/uploads/${uploadId}/complete`,
    };
  }

  async complete(uploadId: string, userId: string) {
    const session = await this.loadActive(uploadId, userId);
    const tempKey = `tmp/${uploadId}`;

    if (!this.storage.localExists(tempKey)) {
      throw new BadRequestException(
        'File belum diunggah ke sesi ini (POST /content dulu)',
      );
    }
    if (this.storage.isRemote) {
      throw new BadRequestException(
        'Mode S3 remote belum mendukung alur transaksi ini; gunakan penyimpanan lokal development.',
      );
    }

    const buffer = this.storage.readLocal(tempKey);
    const contentHash = this.storage.sha256(buffer);

    // Dedup per sekolah: byte identik tidak dibuat ulang.
    const existing = await this.prisma.documentVersion.findFirst({
      where: {
        contentHash,
        document: {
          schoolId: session.schoolId,
          deletedAt: null,
          purgedAt: null,
        },
      },
      include: { document: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      await this.storage.delete(tempKey);
      await this.prisma.uploadSession.update({
        where: { id: uploadId },
        data: { status: 'completed' },
      });
      await this.audit.log({
        schoolId: session.schoolId,
        actorUserId: userId,
        actorMembershipId: session.membershipId ?? undefined,
        action: 'create',
        entityType: 'DocumentVersion',
        metadata: { deduplicated: true, existingVersionId: existing.id },
      });
      return {
        deduplicated: true,
        documentId: existing.documentId,
        documentTitle: existing.document.title,
        existingVersionId: existing.id,
      };
    }

    // Dokumen dibuat saat complete bila initiate tanpa documentId.
    let documentId = session.documentId;
    if (!documentId) {
      const docType = await this.validateDocumentType(
        session.schoolId,
        session.documentTypeId,
      );
      const retention = computeRetention({
        docTypeRetentionType: docType?.retentionType,
        docTypeRetentionMonths: docType?.retentionMonths ?? null,
      });
      const created = await this.prisma.document.create({
        data: {
          schoolId: session.schoolId,
          folderId: session.folderId,
          documentTypeId: session.documentTypeId,
          title: session.title ?? baseName(session.fileName),
          visibility: 'school',
          tags: [],
          retentionType: retention.retentionType,
          retentionExpiresAt: retention.retentionExpiresAt,
          ownerMembershipId: session.membershipId,
        },
      });
      documentId = created.id;
      await this.prisma.uploadSession.update({
        where: { id: uploadId },
        data: { documentId },
      });
    }

    const aggregate = await this.prisma.documentVersion.aggregate({
      where: { documentId },
      _max: { versionNumber: true },
    });
    const versionNumber = (aggregate._max.versionNumber ?? 0) + 1;

    const extension = getExtension(session.fileName);
    const finalKey = this.storage.buildKey(
      session.schoolId,
      contentHash,
      extension,
    );
    await this.storage.put(
      finalKey,
      buffer,
      session.mimeType || 'application/octet-stream',
    );

    const version = await this.prisma.documentVersion.create({
      data: {
        documentId,
        versionNumber,
        storageKey: finalKey,
        fileName: session.fileName,
        mimeType: session.mimeType,
        extension,
        sizeBytes: BigInt(buffer.length),
        contentHash,
        scanStatus: 'clean', // integrasi scan antivirus = Phase 2
        uploadedByMembershipId: session.membershipId,
        changeNote: session.changeNote,
        ocrStatus: 'pending',
      },
    });

    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: documentId },
        data: { currentVersionId: version.id },
      }),
      this.prisma.school.update({
        where: { id: session.schoolId },
        data: { storageUsedBytes: { increment: BigInt(buffer.length) } },
      }),
      this.prisma.uploadSession.update({
        where: { id: uploadId },
        data: { status: 'completed' },
      }),
    ]);

    // Pipeline OCR (§4.3): antre versi baru, lalu indeks full-text.
    await this.prisma.ocrJob.create({
      data: { documentVersionId: version.id, status: 'pending', language: 'id' },
    });
    await reindexDocument(this.prisma, documentId);

    await this.storage.delete(tempKey);
    await this.audit.log({
      schoolId: session.schoolId,
      actorUserId: userId,
      actorMembershipId: session.membershipId ?? undefined,
      action: 'create',
      entityType: 'DocumentVersion',
      entityId: version.id,
      metadata: { versionNumber, documentId },
    });

    return {
      deduplicated: false,
      documentId,
      versionId: version.id,
      versionNumber,
      contentHash,
      scanStatus: 'clean',
      sizeBytes: version.sizeBytes,
    };
  }

  async abort(uploadId: string, userId: string) {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: uploadId },
    });
    if (!session) throw new NotFoundException('Sesi upload tidak ditemukan');
    await this.access.membership(userId, session.schoolId);

    const tempKey = `tmp/${uploadId}`;
    if (this.storage.localExists(tempKey)) {
      await this.storage.delete(tempKey);
    }

    await this.prisma.uploadSession.update({
      where: { id: uploadId },
      data: { status: 'aborted' },
    });
    return { success: true, status: UploadStatus.aborted };
  }

  async status(uploadId: string, userId: string) {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: uploadId },
    });
    if (!session) throw new NotFoundException('Sesi upload tidak ditemukan');
    await this.access.membership(userId, session.schoolId);
    const document = session.documentId
      ? await this.prisma.document.findUnique({
          where: { id: session.documentId },
          select: { id: true, title: true },
        })
      : null;
    return {
      ...session,
      document,
      fileReceived: this.storage.localExists(`tmp/${uploadId}`),
    };
  }

  async part(uploadId: string, userId: string, _dto: PartUploadDto) {
    const session = await this.loadActive(uploadId, userId);
    // MVP mode lokal: satu bagian utuh dikirim ke endpoint /content.
    return {
      partNumber: 1,
      url: `/api/v1/uploads/${session.id}/content`,
      method: 'POST',
      parallelization: 1,
    };
  }

  private async loadActive(uploadId: string, userId: string) {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: uploadId },
    });
    if (!session) throw new NotFoundException('Sesi upload tidak ditemukan');
    if (session.status !== 'initiated') {
      throw new BadRequestException('Sesi upload tidak dalam status initiated');
    }
    await this.access.membership(userId, session.schoolId);
    return session;
  }
}