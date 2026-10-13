import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { EijazahStatus, StudentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { buildEijazahPdf } from './eijazah-pdf';
import { CreateEijazahBatchDto, GenerateEijazahDto } from './dto/eijazah.dto';

/** Role yang boleh mengelola batch & generate ijazah. */
const MANAGE_ROLES: UserRole[] = [
  'headmaster',
  'head_of_administration',
  'operator',
];

/** Role yang boleh menerbitkan/mencabut ijazah (tindakan berwenang). */
const ISSUE_ROLES: UserRole[] = ['headmaster', 'head_of_administration'];

/** Status siswa yang layak menerima ijazah. */
const ELIGIBLE_STATUSES: StudentStatus[] = [
  StudentStatus.active,
  StudentStatus.graduated,
];

/**
 * Kunci tanda tangan. Pada produksi wajib diisi lewat env `EIJAZAH_SIGNING_KEY`.
 * Bila tidak diisi, memakai `JWT_SECRET` lalu konstanta dev.
 */
function signingKey(): string {
  return (
    process.env.EIJAZAH_SIGNING_KEY ??
    process.env.JWT_SECRET ??
    'arsip-eijazah-dev-key'
  );
}

/**
 * Catatan: ini adalah tanda tangan digital simetris (HMAC-SHA256) untuk
 * membuktikan keutuhan data — bukan sertifikat X.509/PKI berbadan hukum.
 * Integrasi PKI/BSrE direncanakan terpisah.
 */
function signContentHash(contentHash: string): string {
  return createHmac('sha256', signingKey()).update(contentHash).digest('hex');
}

function computeContentHash(input: {
  schoolId: string;
  schoolName: string;
  studentId: string;
  studentName: string;
  nisn: string | null;
  nis: string | null;
  gender: string | null;
  academicYearName: string;
  serialNumber: string;
}): string {
  const canonical = [
    'eijazah-v1',
    input.schoolId,
    input.schoolName,
    input.studentId,
    input.studentName,
    input.nisn ?? '',
    input.nis ?? '',
    input.gender ?? '',
    input.academicYearName,
    input.serialNumber,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

/** Basis URL halaman verifikasi publik. */
function verifyBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    process.env.WEB_BASE_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

function buildVerifyUrl(serial: string): string {
  return `${verifyBaseUrl()}/verify/${encodeURIComponent(serial)}`;
}

@Injectable()
export class EijazahService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Batch ----------

  /**
   * Satu batch per (sekolah, tahun ajaran). Pemanggilan berulang bersifat
   * idempoten: mengembalikan batch yang sudah ada.
   */
  async createBatch(
    schoolId: string,
    userId: string,
    dto: CreateEijazahBatchDto,
  ) {
    await this.access.assertRole(userId, schoolId, MANAGE_ROLES);

    const year = await this.prisma.academicYear.findUnique({
      where: { id: dto.academicYearId },
      select: { id: true, schoolId: true },
    });
    if (!year || year.schoolId !== schoolId) {
      throw new BadRequestException('Tahun ajaran tidak valid untuk sekolah ini');
    }

    const existing = await this.prisma.eijazahBatch.findFirst({
      where: { schoolId, academicYearId: dto.academicYearId },
      select: { id: true },
    });
    if (existing) return this.getBatch(existing.id, userId);

    const batch = await this.prisma.eijazahBatch.create({
      data: { schoolId, academicYearId: dto.academicYearId },
    });

    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'create',
      entityType: 'EijazahBatch',
      entityId: batch.id,
      metadata: { academicYearId: dto.academicYearId },
    });
    return this.getBatch(batch.id, userId);
  }

  async listBatches(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    return this.prisma.eijazahBatch.findMany({
      where: { schoolId },
      include: {
        academicYear: { select: { id: true, name: true } },
        _count: { select: { certificates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBatch(id: string, userId: string) {
    const batch = await this.prisma.eijazahBatch.findUnique({
      where: { id },
      include: {
        academicYear: { select: { id: true, name: true } },
        certificates: {
          include: {
            student: {
              select: { id: true, fullName: true, nisn: true, nis: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!batch) throw new NotFoundException('Batch ijazah tidak ditemukan');
    await this.access.membership(userId, batch.schoolId);
    return batch;
  }

  /**
   * Generate sertifikat (status `draft`) untuk seluruh siswa yang terdaftar di
   * kelas pada tahun ajaran batch. Idempoten: siswa yang sudah punya sertifikat
   * pada batch ini dilewati.
   */
  async generateBatch(
    batchId: string,
    userId: string,
    dto: GenerateEijazahDto = {},
  ) {
    const batch = await this.prisma.eijazahBatch.findUnique({
      where: { id: batchId },
      include: {
        school: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });
    if (!batch) throw new NotFoundException('Batch ijazah tidak ditemukan');
    await this.access.assertRole(userId, batch.schoolId, MANAGE_ROLES);

    const links = await this.prisma.studentClassroom.findMany({
      where: {
        academicYearId: batch.academicYearId,
        ...(dto.studentIds?.length
          ? { studentId: { in: dto.studentIds } }
          : {}),
        student: {
          schoolId: batch.schoolId,
          status: { in: ELIGIBLE_STATUSES },
        },
        classroom: { schoolId: batch.schoolId },
      },
      include: { student: true },
      orderBy: { student: { fullName: 'asc' } },
    });

    // Siswa unik (bisa terdaftar di lebih dari satu kelas).
    const seen = new Set<string>();
    const students = links
      .map((link) => link.student)
      .filter((student) => {
        if (seen.has(student.id)) return false;
        seen.add(student.id);
        return true;
      });

    if (students.length === 0) {
      throw new BadRequestException(
        'Belum ada siswa terdaftar pada tahun ajaran ini. Tugaskan siswa ke kelas terlebih dahulu.',
      );
    }

    const existing = await this.prisma.eijazahCertificate.findMany({
      where: { batchId },
      select: { studentId: true, serialNumber: true },
    });
    const existingStudentIds = new Set(existing.map((c) => c.studentId));
    const usedSerials = new Set(existing.map((c) => c.serialNumber));

    const records: Array<{
      batchId: string;
      studentId: string;
      serialNumber: string;
      contentHash: string;
      qrPayload: string;
      status: EijazahStatus;
    }> = [];

    for (const student of students) {
      if (existingStudentIds.has(student.id)) continue;
      const serialNumber = await this.makeSerial(
        batch.schoolId,
        batch.academicYear.name,
        usedSerials,
        records.length + 1,
      );
      const contentHash = computeContentHash({
        schoolId: batch.schoolId,
        schoolName: batch.school.name,
        studentId: student.id,
        studentName: student.fullName,
        nisn: student.nisn,
        nis: student.nis,
        gender: student.gender,
        academicYearName: batch.academicYear.name,
        serialNumber,
      });
      records.push({
        batchId,
        studentId: student.id,
        serialNumber,
        contentHash,
        qrPayload: buildVerifyUrl(serialNumber),
        status: EijazahStatus.draft,
      });
    }

    if (records.length > 0) {
      await this.prisma.eijazahCertificate.createMany({ data: records });
    }
    if (batch.status === 'draft') {
      await this.prisma.eijazahBatch.update({
        where: { id: batchId },
        data: { status: 'generated' },
      });
    }

    await this.audit.log({
      schoolId: batch.schoolId,
      actorUserId: userId,
      action: 'create',
      entityType: 'EijazahCertificate',
      entityId: batchId,
      metadata: { generated: records.length, skipped: existingStudentIds.size },
    });

    const updated = await this.getBatch(batchId, userId);
    return {
      generated: records.length,
      skipped: existingStudentIds.size,
      certificates: updated.certificates,
    };
  }

  // ---------- Sertifikat ----------

  async issueCertificate(id: string, userId: string) {
    const cert = await this.prisma.eijazahCertificate.findUnique({
      where: { id },
      include: { batch: { select: { schoolId: true } } },
    });
    if (!cert) throw new NotFoundException('Ijazah tidak ditemukan');
    await this.access.assertRole(userId, cert.batch.schoolId, ISSUE_ROLES);
    if (cert.status === EijazahStatus.revoked) {
      throw new BadRequestException(
        'Ijazah yang sudah dicabut tidak dapat diterbitkan kembali',
      );
    }

    const updated = await this.prisma.eijazahCertificate.update({
      where: { id },
      data: {
        status: EijazahStatus.issued,
        issuedAt: cert.issuedAt ?? new Date(),
        signature: signContentHash(cert.contentHash),
      },
    });

    await this.audit.log({
      schoolId: cert.batch.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'EijazahCertificate',
      entityId: id,
      metadata: { status: 'issued', serialNumber: cert.serialNumber },
    });
    return updated;
  }

  async revokeCertificate(id: string, userId: string) {
    const cert = await this.prisma.eijazahCertificate.findUnique({
      where: { id },
      include: { batch: { select: { schoolId: true } } },
    });
    if (!cert) throw new NotFoundException('Ijazah tidak ditemukan');
    await this.access.assertRole(userId, cert.batch.schoolId, ISSUE_ROLES);

    const updated = await this.prisma.eijazahCertificate.update({
      where: { id },
      data: {
        status: EijazahStatus.revoked,
        revokedAt: cert.revokedAt ?? new Date(),
      },
    });

    await this.audit.log({
      schoolId: cert.batch.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'EijazahCertificate',
      entityId: id,
      metadata: { status: 'revoked', serialNumber: cert.serialNumber },
    });
    return updated;
  }

  /** Verifikasi publik (tanpa autentikasi). */
  async verify(serialNumber: string) {
    const cert = await this.prisma.eijazahCertificate.findUnique({
      where: { serialNumber },
      include: {
        student: { select: { fullName: true } },
        batch: { include: { school: { select: { name: true } } } },
      },
    });
    if (!cert) {
      return { valid: false, found: false, serialNumber };
    }

    const signatureValid =
      Boolean(cert.signature) && cert.signature === signContentHash(cert.contentHash);
    const valid = cert.status === EijazahStatus.issued && signatureValid;

    return {
      valid,
      found: true,
      serialNumber: cert.serialNumber,
      status: cert.status,
      studentName: cert.student.fullName,
      schoolName: cert.batch.school.name,
      issuedAt: cert.issuedAt,
      revokedAt: cert.revokedAt,
    };
  }

  /** Bangun PDF ijazah secara langsung (tidak disimpan ke storage). */
  async pdfFile(id: string, userId: string) {
    const cert = await this.prisma.eijazahCertificate.findUnique({
      where: { id },
      include: {
        student: true,
        batch: {
          include: {
            academicYear: { select: { id: true, name: true } },
            school: {
              select: { id: true, name: true, npsn: true, city: true },
            },
          },
        },
      },
    });
    if (!cert) throw new NotFoundException('Ijazah tidak ditemukan');
    await this.access.membership(userId, cert.batch.schoolId);

    const headmaster = await this.prisma.membership.findFirst({
      where: {
        schoolId: cert.batch.schoolId,
        role: 'headmaster',
        status: 'active',
      },
      include: { user: { select: { name: true } } },
    });

    const verificationUrl =
      cert.qrPayload ?? buildVerifyUrl(cert.serialNumber);

    const buffer = await buildEijazahPdf({
      schoolName: cert.batch.school.name,
      npsn: cert.batch.school.npsn,
      city: cert.batch.school.city,
      studentName: cert.student.fullName,
      nisn: cert.student.nisn,
      nis: cert.student.nis,
      gender: cert.student.gender,
      birthDate: cert.student.birthDate,
      academicYearName: cert.batch.academicYear.name,
      serialNumber: cert.serialNumber,
      status: cert.status,
      issuedAt: cert.issuedAt,
      signature: cert.signature,
      headmaster: headmaster?.user?.name ?? null,
      qrPayload: verificationUrl,
      verificationUrl,
    });

    const slug = cert.student.fullName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return { buffer, fileName: `ijazah-${slug || 'siswa'}.pdf` };
  }

  // ---------- Helper ----------

  /** Buat nomor seri unik & mudah dibaca untuk sebuah batch. */
  private async makeSerial(
    schoolId: string,
    academicYearName: string,
    used: Set<string>,
    seq: number,
  ): Promise<string> {
    const schoolShort = schoolId.replace(/-/g, '').slice(0, 6).toUpperCase();
    const yearCode = academicYearName.replace(/[^0-9]/g, '') || '0000';
    const base = `IJZ-${schoolShort}-${yearCode}-${String(seq).padStart(4, '0')}`;

    let candidate = base;
    let suffix = 1;
    // Jaminan unik secara global (kolom serial_number unik).
    // eslint-disable-next-line no-await-in-loop
    while (
      used.has(candidate) ||
      (await this.prisma.eijazahCertificate.findUnique({
        where: { serialNumber: candidate },
        select: { id: true },
      }))
    ) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  }
}
