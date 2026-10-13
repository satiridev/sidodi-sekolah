import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateAcademicYearDto,
  CreateClassroomDto,
  CreateDocumentTypeDto,
  CreateSemesterDto,
  UpdateAcademicYearDto,
  UpdateClassroomDto,
  UpdateDocumentTypeDto,
  UpdateSemesterDto,
} from './dto/academic.dto';

const ADMIN_ROLES: UserRole[] = [
  'headmaster',
  'head_of_administration',
  'operator',
];

@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Tahun Ajaran ----------

  async listAcademicYears(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    return this.prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { semesters: true, classrooms: true } } },
    });
  }

  async createAcademicYear(
    schoolId: string,
    userId: string,
    dto: CreateAcademicYearDto,
  ) {
    const actor = await this.access.assertRole(userId, schoolId, ADMIN_ROLES);
    const year = await this.prisma.$transaction(async (tx) => {
      if (dto.isActive) {
        await tx.academicYear.updateMany({
          where: { schoolId },
          data: { isActive: false },
        });
      }
      return tx.academicYear.create({
        data: {
          schoolId,
          name: dto.name,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          isActive: dto.isActive ?? false,
        },
      });
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'AcademicYear',
      entityId: year.id,
    });
    return year;
  }

  private async loadYear(id: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException('Tahun ajaran tidak ditemukan');
    return year;
  }

  async getAcademicYear(id: string, userId: string) {
    const year = await this.loadYear(id);
    await this.access.membership(userId, year.schoolId);
    return this.prisma.academicYear.findUnique({
      where: { id },
      include: {
        semesters: { orderBy: { startDate: 'asc' } },
        classrooms: { orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }] },
      },
    });
  }

  async updateAcademicYear(
    id: string,
    userId: string,
    dto: UpdateAcademicYearDto,
  ) {
    const year = await this.loadYear(id);
    const actor = await this.access.assertRole(userId, year.schoolId, ADMIN_ROLES);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isActive) {
        await tx.academicYear.updateMany({
          where: { schoolId: year.schoolId },
          data: { isActive: false },
        });
      }
      return tx.academicYear.update({
        where: { id },
        data: { ...this.mapDates(dto) },
      });
    });
    await this.audit.log({
      schoolId: year.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'AcademicYear',
      entityId: id,
    });
    return updated;
  }

  async activateAcademicYear(id: string, userId: string) {
    const year = await this.loadYear(id);
    const actor = await this.access.assertRole(userId, year.schoolId, ADMIN_ROLES);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({
        where: { schoolId: year.schoolId },
        data: { isActive: false },
      });
      return tx.academicYear.update({ where: { id }, data: { isActive: true } });
    });
    await this.audit.log({
      schoolId: year.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'AcademicYear',
      entityId: id,
      metadata: { activated: true },
    });
    return updated;
  }

  async deleteAcademicYear(id: string, userId: string) {
    const year = await this.loadYear(id);
    const actor = await this.access.assertRole(userId, year.schoolId, ['headmaster', 'head_of_administration']);

    const docs = await this.prisma.document.count({
      where: {
        schoolId: year.schoolId,
        folder: { academicYearId: id },
        deletedAt: null,
      },
    });
    if (docs > 0) {
      throw new BadRequestException(
        'Tahun ajaran masih memiliki dokumen arsip; pindahkan atau hapus dokumen terlebih dahulu.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.folder.deleteMany({ where: { academicYearId: id } }),
      this.prisma.classroom.deleteMany({ where: { academicYearId: id } }),
      this.prisma.semester.deleteMany({ where: { academicYearId: id } }),
      this.prisma.academicYear.delete({ where: { id } }),
    ]);
    await this.audit.log({
      schoolId: year.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'delete',
      entityType: 'AcademicYear',
      entityId: id,
    });
    return { success: true };
  }

  // ---------- Semester ----------

  async listSemesters(academicYearId: string, userId: string) {
    const year = await this.loadYear(academicYearId);
    await this.access.membership(userId, year.schoolId);
    return this.prisma.semester.findMany({
      where: { academicYearId },
      orderBy: { startDate: 'asc' },
    });
  }

  async getSemester(id: string, userId: string) {
    const semester = await this.prisma.semester.findUnique({ where: { id } });
    if (!semester) throw new NotFoundException('Semester tidak ditemukan');
    const year = await this.loadYear(semester.academicYearId);
    await this.access.membership(userId, year.schoolId);
    return semester;
  }

  async createSemester(
    academicYearId: string,
    userId: string,
    dto: CreateSemesterDto,
  ) {
    const year = await this.loadYear(academicYearId);
    const actor = await this.access.assertRole(userId, year.schoolId, ADMIN_ROLES);
    const semester = await this.prisma.semester.create({
      data: {
        academicYearId,
        name: dto.name,
        term: dto.term,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isActive: dto.isActive ?? false,
      },
    });
    await this.audit.log({
      schoolId: year.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'Semester',
      entityId: semester.id,
    });
    return semester;
  }

  async updateSemester(id: string, userId: string, dto: UpdateSemesterDto) {
    const semester = await this.prisma.semester.findUnique({ where: { id } });
    if (!semester) throw new NotFoundException('Semester tidak ditemukan');
    const year = await this.loadYear(semester.academicYearId);
    const actor = await this.access.assertRole(userId, year.schoolId, ADMIN_ROLES);
    const updated = await this.prisma.semester.update({
      where: { id },
      data: {
        name: dto.name,
        term: dto.term,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isActive: dto.isActive,
      },
    });
    await this.audit.log({
      schoolId: year.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'Semester',
      entityId: id,
    });
    return updated;
  }

  async deleteSemester(id: string, userId: string) {
    const semester = await this.prisma.semester.findUnique({ where: { id } });
    if (!semester) throw new NotFoundException('Semester tidak ditemukan');
    const year = await this.loadYear(semester.academicYearId);
    const actor = await this.access.assertRole(userId, year.schoolId, ['headmaster', 'head_of_administration']);
    const docs = await this.prisma.document.count({
      where: { schoolId: year.schoolId, folder: { semesterId: id }, deletedAt: null },
    });
    if (docs > 0) {
      throw new BadRequestException('Semester masih memiliki dokumen arsip');
    }
    await this.prisma.$transaction([
      this.prisma.folder.deleteMany({ where: { semesterId: id } }),
      this.prisma.semester.delete({ where: { id } }),
    ]);
    await this.audit.log({
      schoolId: year.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'delete',
      entityType: 'Semester',
      entityId: id,
    });
    return { success: true };
  }

  // ---------- Kelas ----------

  async listClassrooms(schoolId: string, userId: string, academicYearId?: string) {
    await this.access.membership(userId, schoolId);
    return this.prisma.classroom.findMany({
      where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      include: {
        academicYear: { select: { id: true, name: true } },
        homeroomTeacher: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { folders: true } },
      },
    });
  }

  async createClassroom(
    schoolId: string,
    userId: string,
    dto: CreateClassroomDto,
  ) {
    const actor = await this.access.assertRole(userId, schoolId, ADMIN_ROLES);
    const year = await this.prisma.academicYear.findUnique({
      where: { id: dto.academicYearId },
    });
    if (!year || year.schoolId !== schoolId) {
      throw new BadRequestException('Tahun ajaran tidak valid untuk sekolah ini');
    }
    const classroom = await this.prisma.classroom.create({
      data: {
        schoolId,
        academicYearId: dto.academicYearId,
        name: dto.name,
        gradeLevel: dto.gradeLevel,
        homeroomTeacherMembershipId: dto.homeroomTeacherMembershipId,
      },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'Classroom',
      entityId: classroom.id,
    });
    return classroom;
  }

  async getClassroom(id: string, userId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id },
      include: {
        homeroomTeacher: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!classroom) throw new NotFoundException('Kelas tidak ditemukan');
    await this.access.membership(userId, classroom.schoolId);
    return classroom;
  }

  async updateClassroom(id: string, userId: string, dto: UpdateClassroomDto) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id } });
    if (!classroom) throw new NotFoundException('Kelas tidak ditemukan');
    const actor = await this.access.assertRole(userId, classroom.schoolId, ADMIN_ROLES);
    const updated = await this.prisma.classroom.update({ where: { id }, data: { ...dto } });
    await this.audit.log({
      schoolId: classroom.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'Classroom',
      entityId: id,
    });
    return updated;
  }

  async deleteClassroom(id: string, userId: string) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id } });
    if (!classroom) throw new NotFoundException('Kelas tidak ditemukan');
    const actor = await this.access.assertRole(userId, classroom.schoolId, ['headmaster', 'head_of_administration']);
    const docs = await this.prisma.document.count({
      where: { schoolId: classroom.schoolId, folder: { classroomId: id }, deletedAt: null },
    });
    if (docs > 0) {
      throw new BadRequestException('Kelas masih memiliki dokumen arsip');
    }
    await this.prisma.$transaction([
      this.prisma.folder.deleteMany({ where: { classroomId: id } }),
      this.prisma.classroom.delete({ where: { id } }),
    ]);
    await this.audit.log({
      schoolId: classroom.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'delete',
      entityType: 'Classroom',
      entityId: id,
    });
    return { success: true };
  }

  // ---------- Jenis Dokumen ----------

  async listDocumentTypes(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    return this.prisma.documentType.findMany({
      where: { OR: [{ schoolId }, { schoolId: null }] },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async createDocumentType(
    schoolId: string,
    userId: string,
    dto: CreateDocumentTypeDto,
  ) {
    const actor = await this.access.assertRole(userId, schoolId, ['headmaster', 'head_of_administration']);
    const docType = await this.prisma.documentType.create({
      data: {
        schoolId,
        name: dto.name,
        code: dto.code.toLowerCase(),
        description: dto.description,
        retentionType: dto.retentionType,
        retentionMonths: dto.retentionMonths,
        allowedExtensions: dto.allowedExtensions ?? [],
        maxSizeBytes: dto.maxSizeBytes ? BigInt(dto.maxSizeBytes) : undefined,
        requiresLegalHold: dto.requiresLegalHold ?? false,
        isSystem: false,
      },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'DocumentType',
      entityId: docType.id,
    });
    return docType;
  }

  async getDocumentType(id: string, userId: string, schoolId?: string) {
    const docType = await this.prisma.documentType.findUnique({ where: { id } });
    if (!docType) throw new NotFoundException('Jenis dokumen tidak ditemukan');
    if (docType.schoolId) {
      await this.access.membership(userId, docType.schoolId);
    } else if (schoolId) {
      await this.access.membership(userId, schoolId);
    } else {
      throw new BadRequestException('schoolId wajib untuk jenis dokumen sistem');
    }
    return docType;
  }

  async updateDocumentType(id: string, userId: string, dto: UpdateDocumentTypeDto) {
    const docType = await this.prisma.documentType.findUnique({ where: { id } });
    if (!docType) throw new NotFoundException('Jenis dokumen tidak ditemukan');
    if (!docType.schoolId) {
      throw new BadRequestException('Jenis dokumen sistem tidak dapat diubah');
    }
    const actor = await this.access.assertRole(userId, docType.schoolId, ['headmaster', 'head_of_administration']);
    const updated = await this.prisma.documentType.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code?.toLowerCase(),
        description: dto.description,
        retentionType: dto.retentionType,
        retentionMonths: dto.retentionMonths,
        allowedExtensions: dto.allowedExtensions,
        maxSizeBytes: dto.maxSizeBytes ? BigInt(dto.maxSizeBytes) : undefined,
        requiresLegalHold: dto.requiresLegalHold,
      },
    });
    await this.audit.log({
      schoolId: docType.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'DocumentType',
      entityId: id,
    });
    return updated;
  }

  async deleteDocumentType(id: string, userId: string) {
    const docType = await this.prisma.documentType.findUnique({ where: { id } });
    if (!docType) throw new NotFoundException('Jenis dokumen tidak ditemukan');
    if (!docType.schoolId) {
      throw new BadRequestException('Jenis dokumen sistem tidak dapat dihapus');
    }
    const actor = await this.access.assertRole(userId, docType.schoolId, ['headmaster', 'head_of_administration']);
    const docs = await this.prisma.document.count({
      where: { documentTypeId: id, deletedAt: null },
    });
    if (docs > 0) {
      throw new BadRequestException('Jenis dokumen masih dipakai oleh dokumen arsip');
    }
    await this.prisma.documentType.delete({ where: { id } });
    await this.audit.log({
      schoolId: docType.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'delete',
      entityType: 'DocumentType',
      entityId: id,
    });
    return { success: true };
  }

  private mapDates(dto: UpdateAcademicYearDto) {
    return {
      name: dto.name,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      isActive: dto.isActive,
    };
  }
}