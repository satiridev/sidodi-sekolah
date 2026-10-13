import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, ReportCard } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { buildReportCardPdf } from './report-card-pdf';
import {
  GenerateReportCardsDto,
  ListReportCardsDto,
} from './dto/report.dto';

const STAFF_ROLES: UserRole[] = [
  'headmaster',
  'head_of_administration',
  'operator',
  'teacher',
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Membuat raport PDF untuk seluruh siswa yang terdaftar di kelas pada
   * semester tertentu. Bersifat idempoten: generate ulang menimpa berkas dan
   * memperbarui baris report_cards yang sudah ada.
   */
  async generateForClassroom(
    classroomId: string,
    userId: string,
    dto: GenerateReportCardsDto,
  ) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        school: { select: { id: true, name: true, city: true } },
        academicYear: { select: { id: true, name: true } },
      },
    });
    if (!classroom) throw new NotFoundException('Kelas tidak ditemukan');
    await this.access.assertRole(userId, classroom.schoolId, STAFF_ROLES);

    const semester = await this.prisma.semester.findUnique({
      where: { id: dto.semesterId },
    });
    if (!semester || semester.academicYearId !== classroom.academicYearId) {
      throw new BadRequestException('Semester tidak sesuai dengan kelas ini');
    }

    const links = await this.prisma.studentClassroom.findMany({
      where: {
        classroomId,
        academicYearId: classroom.academicYearId,
        ...(dto.studentIds?.length
          ? { studentId: { in: dto.studentIds } }
          : {}),
      },
      include: { student: true },
      orderBy: { student: { fullName: 'asc' } },
    });
    if (links.length === 0) {
      throw new BadRequestException(
        'Belum ada siswa terdaftar di kelas ini. Tugaskan siswa terlebih dahulu.',
      );
    }

    const studentIds = links.map((l) => l.studentId);
    const grades = await this.prisma.grade.findMany({
      where: {
        classroomId,
        term: semester.term,
        studentId: { in: studentIds },
      },
      include: { subject: { select: { name: true, code: true } } },
    });

    const [headmaster, homeroom] = await Promise.all([
      this.prisma.membership.findFirst({
        where: {
          schoolId: classroom.schoolId,
          role: 'headmaster',
          status: 'active',
        },
        include: { user: { select: { name: true } } },
      }),
      classroom.homeroomTeacherMembershipId
        ? this.prisma.membership.findUnique({
            where: { id: classroom.homeroomTeacherMembershipId },
            include: { user: { select: { name: true } } },
          })
        : Promise.resolve(null),
    ]);

    const generatedAt = new Date();
    const reportCards: ReportCard[] = [];

    for (const link of links) {
      const own = grades
        .filter((g) => g.studentId === link.studentId)
        .sort((a, b) => a.subject.name.localeCompare(b.subject.name))
        .map((g) => ({
          subject: g.subject.name,
          code: g.subject.code,
          score: Number(g.score),
          note: g.note,
        }));

      const pdf = await buildReportCardPdf({
        schoolName: classroom.school.name,
        city: classroom.school.city,
        studentName: link.student.fullName,
        nisn: link.student.nisn,
        nis: link.student.nis,
        gender: link.student.gender,
        classroomName: classroom.name,
        academicYearName: classroom.academicYear.name,
        semesterName: semester.name,
        grades: own,
        homeroomTeacher: homeroom?.user?.name ?? null,
        headmaster: headmaster?.user?.name ?? null,
        generatedAt,
      });

      const key = `${classroom.schoolId}/report-cards/${classroom.id}/${link.studentId}-${semester.id}.pdf`;
      await this.storage.put(key, pdf, 'application/pdf');

      const existing = await this.prisma.reportCard.findFirst({
        where: {
          studentId: link.studentId,
          classroomId,
          academicYearId: classroom.academicYearId,
          semesterId: semester.id,
        },
      });

      const data = {
        studentId: link.studentId,
        classroomId,
        academicYearId: classroom.academicYearId,
        semesterId: semester.id,
        status: 'generated',
        storageKey: key,
        generatedAt,
      };

      const card = existing
        ? await this.prisma.reportCard.update({
            where: { id: existing.id },
            data,
          })
        : await this.prisma.reportCard.create({ data });
      reportCards.push(card);
    }

    await this.audit.log({
      schoolId: classroom.schoolId,
      actorUserId: userId,
      action: 'create',
      entityType: 'ReportCard',
      entityId: classroomId,
      metadata: { generated: reportCards.length, semesterId: semester.id },
    });

    return { generated: reportCards.length, reportCards };
  }

  async listForClassroom(
    classroomId: string,
    userId: string,
    query: ListReportCardsDto = {},
  ) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { schoolId: true },
    });
    if (!classroom) throw new NotFoundException('Kelas tidak ditemukan');
    await this.access.membership(userId, classroom.schoolId);

    return this.prisma.reportCard.findMany({
      where: {
        classroomId,
        ...(query.semesterId ? { semesterId: query.semesterId } : {}),
        ...(query.studentId ? { studentId: query.studentId } : {}),
      },
      include: {
        student: { select: { id: true, fullName: true, nisn: true } },
        semester: { select: { id: true, name: true, term: true } },
        academicYear: { select: { id: true, name: true } },
      },
      orderBy: [{ student: { fullName: 'asc' } }],
    });
  }

  /** Metadata unduhan; controller yang mengalirkan berkasnya. */
  async pdfFile(id: string, userId: string) {
    const card = await this.prisma.reportCard.findUnique({
      where: { id },
      include: {
        student: { select: { fullName: true } },
        classroom: { select: { schoolId: true, name: true } },
        semester: { select: { name: true } },
      },
    });
    if (!card) throw new NotFoundException('Raport tidak ditemukan');
    await this.access.membership(userId, card.classroom.schoolId);
    if (!card.storageKey) {
      throw new BadRequestException('Raport belum dibuat');
    }

    const slug = card.student.fullName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return {
      key: card.storageKey,
      fileName: `raport-${slug || 'siswa'}.pdf`,
    };
  }
}
