import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateFolderDto,
  GenerateFoldersDto,
  UpdateFolderDto,
} from './dto/folder.dto';

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Auto-generate struktur folder: Arsip > TA > Semester > Kelas > Jenis Dokumen. */
  async generate(schoolId: string, userId: string, dto: GenerateFoldersDto) {
    const actor = await this.access.assertRole(userId, schoolId, [
      'headmaster',
      'head_of_administration',
    ]);

    const year = dto.academicYearId
      ? await this.prisma.academicYear.findFirst({
          where: { id: dto.academicYearId, schoolId },
        })
      : await this.prisma.academicYear.findFirst({
          where: { schoolId, isActive: true },
        });
    if (!year) {
      throw new BadRequestException(
        'Tahun ajaran tidak ditemukan; jadikan satu tahun ajaran aktif terlebih dahulu.',
      );
    }

    const semesters = await this.prisma.semester.findMany({
      where: { academicYearId: year.id },
      orderBy: { startDate: 'asc' },
    });
    const classrooms = await this.prisma.classroom.findMany({
      where: { schoolId, academicYearId: year.id },
      orderBy: { name: 'asc' },
    });
    const docTypes = await this.prisma.documentType.findMany({
      where: { OR: [{ schoolId }, { schoolId: null }] },
      orderBy: { name: 'asc' },
    });

    const created: string[] = [];

    // Tingkat 1: root
    const root = await this.ensure(
      schoolId, null, 'Arsip Sekolah', {}, created,
    );

    // Administrasi umum (non-akademik)
    const adm = await this.ensure(
      schoolId, root.id, '01_Administrasi_Umum', {}, created,
    );
    const adminChildren = [
      '01_Legalitas_&_Akreditasi',
      '02_Kepegawaian_(SK_Guru_&_Staff)',
      '03_Keuangan_&_BOS',
      '04_Tata_Usaha',
    ];
    for (const child of adminChildren) {
      await this.ensure(schoolId, adm.id, child, {}, created);
    }

    // Tingkat 2-5: TA > Semester > Kelas > Jenis Dokumen
    const yearFolder = await this.ensure(
      schoolId, root.id, year.name,
      { academicYearId: year.id }, created,
    );

    for (const sem of semesters) {
      const semFolder = await this.ensure(
        schoolId, yearFolder.id, sem.name,
        { academicYearId: year.id, semesterId: sem.id }, created,
      );
      for (const cls of classrooms) {
        const clsFolder = await this.ensure(
          schoolId, semFolder.id, cls.name,
          {
            academicYearId: year.id,
            semesterId: sem.id,
            classroomId: cls.id,
          }, created,
        );
        for (const docType of docTypes) {
          await this.ensure(
            schoolId, clsFolder.id, docType.name,
            {
              academicYearId: year.id,
              semesterId: sem.id,
              classroomId: cls.id,
              documentTypeId: docType.id,
            }, created,
          );
        }
      }
    }

    const total = await this.prisma.folder.count({ where: { schoolId } });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'Folder',
      metadata: {
        generated: true,
        newFolders: created.length,
        totalFolders: total,
        academicYearId: year.id,
      },
    });

    return {
      generated: created.length,
      totalFolders: total,
      academicYearId: year.id,
      skippedDuplicates: true,
    };
  }

  private async ensure(
    schoolId: string,
    parentId: string | null,
    name: string,
    refs: {
      academicYearId?: string;
      semesterId?: string;
      classroomId?: string;
      documentTypeId?: string;
    },
    created: string[],
  ) {
    const existing = await this.prisma.folder.findFirst({
      where: { schoolId, parentId, name },
    });
    if (existing) return existing;

    const parent = parentId
      ? await this.prisma.folder.findUnique({ where: { id: parentId } })
      : null;
    const path = parent ? `${parent.path}/${name}` : `/${name}`;

    const folder = await this.prisma.folder.create({
      data: {
        schoolId,
        parentId,
        name,
        path,
        academicYearId: refs.academicYearId,
        semesterId: refs.semesterId,
        classroomId: refs.classroomId,
        documentTypeId: refs.documentTypeId,
      },
    });
    created.push(folder.id);
    return folder;
  }

  async tree(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    const folders = await this.prisma.folder.findMany({
      where: { schoolId },
      orderBy: { path: 'asc' },
      include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
    });
    return this.buildTree(folders);
  }

  private buildTree(
    folders: Array<{ id: string; parentId: string | null; name: string; path: string; [k: string]: unknown }>,
  ) {
    const map = new Map<string, Record<string, unknown>>();
    const roots: Record<string, unknown>[] = [];
    for (const f of folders) {
      map.set(f.id, { ...f, children: [] });
    }
    for (const f of folders) {
      const node = map.get(f.id)!;
      if (f.parentId && map.has(f.parentId)) {
        (map.get(f.parentId)!.children as unknown[]).push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async get(folderId: string, userId: string) {
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder tidak ditemukan');
    await this.access.membership(userId, folder.schoolId);
    return folder;
  }

  async contents(folderId: string, userId: string) {
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder tidak ditemukan');
    await this.access.membership(userId, folder.schoolId);

    const [children, documents] = await this.prisma.$transaction([
      this.prisma.folder.findMany({
        where: { parentId: folderId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
      }),
      this.prisma.document.findMany({
        where: { folderId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          documentType: true,
          currentVersion: true,
          owner: { include: { user: { select: { name: true } } } },
        },
      }),
    ]);

    return { folder, children, documents };
  }

  async create(schoolId: string, userId: string, dto: CreateFolderDto) {
    const actor = await this.access.assertRole(userId, schoolId, [
      'headmaster',
      'head_of_administration',
      'operator',
      'teacher',
    ]);
    if (dto.parentId) {
      const parent = await this.prisma.folder.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.schoolId !== schoolId) {
        throw new BadRequestException('Folder induk tidak valid');
      }
    }
    const parent = dto.parentId
      ? await this.prisma.folder.findUnique({ where: { id: dto.parentId } })
      : null;
    const path = parent ? `${parent.path}/${dto.name}` : `/${dto.name}`;

    const folder = await this.prisma.folder.create({
      data: {
        schoolId,
        parentId: dto.parentId,
        name: dto.name,
        path,
        academicYearId: dto.academicYearId,
        semesterId: dto.semesterId,
        classroomId: dto.classroomId,
        documentTypeId: dto.documentTypeId,
      },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'create',
      entityType: 'Folder',
      entityId: folder.id,
    });
    return folder;
  }

  async update(folderId: string, userId: string, dto: UpdateFolderDto) {
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder tidak ditemukan');
    const actor = await this.access.assertRole(userId, folder.schoolId, [
      'headmaster',
      'head_of_administration',
      'operator',
      'teacher',
    ]);

    let path = folder.path;
    let parentId = folder.parentId;
    if (dto.parentId && dto.parentId !== folder.parentId) {
      const newParent = await this.prisma.folder.findUnique({
        where: { id: dto.parentId },
      });
      if (!newParent || newParent.schoolId !== folder.schoolId) {
        throw new BadRequestException('Folder induk tidak valid');
      }
      parentId = newParent.id;
      path = `${newParent.path}/${dto.name ?? folder.name}`;
    } else {
      const parent = folder.parentId
        ? await this.prisma.folder.findUnique({ where: { id: folder.parentId } })
        : null;
      path = `${parent ? parent.path : ''}/${dto.name ?? folder.name}`;
    }

    const updated = await this.prisma.folder.update({
      where: { id: folderId },
      data: {
        name: dto.name,
        parentId,
        path,
      },
    });
    await this.audit.log({
      schoolId: folder.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'Folder',
      entityId: folderId,
    });
    return updated;
  }

  async delete(folderId: string, userId: string) {
    const folder = await this.prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) throw new NotFoundException('Folder tidak ditemukan');
    const actor = await this.access.assertRole(userId, folder.schoolId, [
      'headmaster',
      'head_of_administration',
    ]);

    const [childCount, docCount] = await this.prisma.$transaction([
      this.prisma.folder.count({ where: { parentId: folderId } }),
      this.prisma.document.count({
        where: { folderId, deletedAt: null },
      }),
    ]);
    if (childCount > 0 || docCount > 0) {
      throw new BadRequestException(
        'Folder harus kosong sebelum dihapus (pindahkan anak & dokumen terlebih dahulu)',
      );
    }

    await this.prisma.folder.delete({ where: { id: folderId } });
    await this.audit.log({
      schoolId: folder.schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'delete',
      entityType: 'Folder',
      entityId: folderId,
    });
    return { success: true };
  }
}