import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StudentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import {
  AssignStudentsDto,
  BulkGradesDto,
  CreateStudentDto,
  CreateSubjectDto,
  GradeEntryDto,
  ListGradesDto,
  ListStudentsDto,
  UpdateStudentDto,
} from './dto/student.dto';

/** Role yang boleh mengelola data induk siswa & mata pelajaran. */
const MANAGE_ROLES: UserRole[] = [
  'headmaster',
  'head_of_administration',
  'operator',
];

/** Role yang boleh menginput nilai (termasuk guru). */
const STAFF_ROLES: UserRole[] = [...MANAGE_ROLES, 'teacher'];

/** Pemetaan judul kolom CSV (Indonesia & Inggris) ke nama field. */
const HEADER_ALIASES: Record<string, keyof CsvRow> = {
  fullname: 'fullName',
  'full name': 'fullName',
  nama: 'fullName',
  'nama lengkap': 'fullName',
  name: 'fullName',
  nisn: 'nisn',
  nis: 'nis',
  gender: 'gender',
  'jenis kelamin': 'gender',
  jenis_kelamin: 'gender',
  jk: 'gender',
  birthdate: 'birthDate',
  'tanggal lahir': 'birthDate',
  tanggal_lahir: 'birthDate',
  status: 'status',
};

interface CsvRow {
  fullName?: string;
  nisn?: string;
  nis?: string;
  gender?: string;
  birthDate?: string;
  status?: string;
}

/** Parser CSV ringan yang mendukung tanda kutip ganda dan koma dalam sel. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function normalizeGender(value?: string): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (['l', 'lk', 'laki-laki', 'laki laki', 'pria', 'male'].includes(v)) return 'L';
  if (['p', 'pr', 'perempuan', 'wanita', 'female'].includes(v)) return 'P';
  return value!.trim();
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Siswa ----------

  async listStudents(schoolId: string, userId: string, query: ListStudentsDto) {
    await this.access.membership(userId, schoolId);

    const classroomFilter: Prisma.StudentClassroomWhereInput | undefined =
      query.classroomId || query.academicYearId
        ? {
            ...(query.classroomId ? { classroomId: query.classroomId } : {}),
            ...(query.academicYearId
              ? { academicYearId: query.academicYearId }
              : {}),
          }
        : undefined;

    const where: Prisma.StudentWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(classroomFilter ? { classrooms: { some: classroomFilter } } : {}),
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { nisn: { contains: query.q, mode: 'insensitive' } },
              { nis: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.student.findMany({
      where,
      include: {
        classrooms: {
          include: { classroom: { select: { id: true, name: true } } },
        },
      },
      orderBy: { fullName: 'asc' },
      take: 1000,
    });
  }

  async getStudent(id: string, userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        classrooms: {
          include: {
            classroom: { select: { id: true, name: true, gradeLevel: true } },
            academicYear: { select: { id: true, name: true } },
          },
        },
        grades: {
          include: { subject: { select: { id: true, name: true, code: true } } },
        },
        reportCards: {
          include: {
            semester: { select: { id: true, name: true, term: true } },
            academicYear: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');
    await this.access.membership(userId, student.schoolId);
    return student;
  }

  async createStudent(schoolId: string, userId: string, dto: CreateStudentDto) {
    await this.access.assertRole(userId, schoolId, MANAGE_ROLES);

    const student = await this.prisma.student.create({
      data: {
        schoolId,
        fullName: dto.fullName.trim(),
        nisn: dto.nisn?.trim() || null,
        nis: dto.nis?.trim() || null,
        gender: normalizeGender(dto.gender) ?? null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        status: dto.status ?? StudentStatus.active,
      },
    });

    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'create',
      entityType: 'Student',
      entityId: student.id,
      metadata: { fullName: student.fullName },
    });
    return student;
  }

  async updateStudent(id: string, userId: string, dto: UpdateStudentDto) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');
    await this.access.assertRole(userId, student.schoolId, MANAGE_ROLES);

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.nisn !== undefined ? { nisn: dto.nisn.trim() || null } : {}),
        ...(dto.nis !== undefined ? { nis: dto.nis.trim() || null } : {}),
        ...(dto.gender !== undefined
          ? { gender: normalizeGender(dto.gender) ?? null }
          : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: new Date(dto.birthDate) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    await this.audit.log({
      schoolId: student.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'Student',
      entityId: id,
    });
    return updated;
  }

  /**
   * Soft delete: siswa dinonaktifkan (status `inactive`) agar nilai & raport
   * yang bersifat arsip permanen tetap utuh. Mengembalikan 204 di controller.
   */
  async removeStudent(id: string, userId: string) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');
    await this.access.assertRole(userId, student.schoolId, MANAGE_ROLES);

    await this.prisma.student.update({
      where: { id },
      data: { status: StudentStatus.inactive },
    });
    await this.audit.log({
      schoolId: student.schoolId,
      actorUserId: userId,
      action: 'delete',
      entityType: 'Student',
      entityId: id,
      metadata: { softDelete: true },
    });
  }

  /** Impor CSV: `fullName` wajib; kolom lain opsional. */
  async importStudents(
    schoolId: string,
    userId: string,
    file?: Express.Multer.File,
  ) {
    await this.access.assertRole(userId, schoolId, MANAGE_ROLES);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Berkas CSV wajib diunggah');
    }

    const rows = parseCsv(file.buffer.toString('utf8'));
    if (rows.length === 0) {
      throw new BadRequestException('Berkas CSV kosong');
    }

    // Deteksi header bila salah satu sel cocok dengan alias kolom yang dikenal.
    const firstRow = rows[0].map((c) => c.trim().toLowerCase());
    const hasHeader = firstRow.some((c) => c in HEADER_ALIASES);
    const bodyRows = hasHeader ? rows.slice(1) : rows;

    let created = 0;
    let skipped = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let idx = 0; idx < bodyRows.length; idx += 1) {
      const lineNumber = idx + (hasHeader ? 2 : 1);
      const cells = bodyRows[idx].map((c) => c.trim());
      const row: CsvRow = {};

      if (hasHeader) {
        firstRow.forEach((header, col) => {
          const key = HEADER_ALIASES[header];
          if (key) row[key] = cells[col] ?? '';
        });
      } else {
        row.fullName = cells[0];
        row.nisn = cells[1];
        row.nis = cells[2];
        row.gender = cells[3];
        row.birthDate = cells[4];
        row.status = cells[5];
      }

      const fullName = (row.fullName ?? '').trim();
      if (!fullName) {
        skipped += 1;
        errors.push({ row: lineNumber, message: 'Kolom nama kosong' });
        continue;
      }

      const status = (row.status ?? '').trim();
      const birthDate = (row.birthDate ?? '').trim();

      try {
        await this.prisma.student.create({
          data: {
            schoolId,
            fullName,
            nisn: (row.nisn ?? '').trim() || null,
            nis: (row.nis ?? '').trim() || null,
            gender: normalizeGender(row.gender) ?? null,
            birthDate: birthDate ? new Date(birthDate) : null,
            status:
              status && (Object.values(StudentStatus) as string[]).includes(status)
                ? (status as StudentStatus)
                : StudentStatus.active,
          },
        });
        created += 1;
      } catch (err) {
        skipped += 1;
        errors.push({
          row: lineNumber,
          message: err instanceof Error ? err.message : 'Gagal menyimpan baris',
        });
      }
    }

    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'create',
      entityType: 'Student',
      metadata: { imported: created, skipped, source: file.originalname },
    });

    return { created, skipped, total: bodyRows.length, errors };
  }

  // ---------- Mata pelajaran ----------

  async listSubjects(schoolId: string, userId: string) {
    await this.access.membership(userId, schoolId);
    return this.prisma.subject.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(schoolId: string, userId: string, dto: CreateSubjectDto) {
    await this.access.assertRole(userId, schoolId, MANAGE_ROLES);
    const existing = await this.prisma.subject.findUnique({
      where: { schoolId_code: { schoolId, code: dto.code.trim() } },
    });
    if (existing) {
      throw new ConflictException('Kode mata pelajaran sudah dipakai');
    }

    const subject = await this.prisma.subject.create({
      data: { schoolId, name: dto.name.trim(), code: dto.code.trim() },
    });
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'create',
      entityType: 'Subject',
      entityId: subject.id,
      metadata: { code: subject.code },
    });
    return subject;
  }

  // ---------- Penugasan siswa ke kelas ----------

  async listClassroomStudents(classroomId: string, userId: string) {
    const classroom = await this.resolveClassroom(classroomId);
    await this.access.membership(userId, classroom.schoolId);

    const links = await this.prisma.studentClassroom.findMany({
      where: { classroomId },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            nisn: true,
            nis: true,
            gender: true,
            status: true,
          },
        },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
    return links;
  }

  async assignStudents(
    classroomId: string,
    userId: string,
    dto: AssignStudentsDto,
  ) {
    const classroom = await this.resolveClassroom(classroomId);
    await this.access.assertRole(userId, classroom.schoolId, MANAGE_ROLES);

    const students = await this.prisma.student.findMany({
      where: { id: { in: dto.studentIds }, schoolId: classroom.schoolId },
      select: { id: true },
    });
    if (students.length !== dto.studentIds.length) {
      throw new BadRequestException(
        'Ada siswa yang tidak ditemukan di sekolah ini',
      );
    }

    await this.prisma.$transaction(
      dto.studentIds.map((studentId) =>
        this.prisma.studentClassroom.upsert({
          where: {
            studentId_classroomId_academicYearId: {
              studentId,
              classroomId,
              academicYearId: classroom.academicYearId,
            },
          },
          create: {
            studentId,
            classroomId,
            academicYearId: classroom.academicYearId,
          },
          update: {},
        }),
      ),
    );

    await this.audit.log({
      schoolId: classroom.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'StudentClassroom',
      entityId: classroomId,
      metadata: { assigned: dto.studentIds.length },
    });

    return { assigned: dto.studentIds.length };
  }

  // ---------- Nilai ----------

  async listGrades(
    classroomId: string,
    userId: string,
    query: ListGradesDto = {},
  ) {
    const classroom = await this.resolveClassroom(classroomId);
    await this.access.membership(userId, classroom.schoolId);

    return this.prisma.grade.findMany({
      where: {
        classroomId,
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.term ? { term: query.term } : {}),
      },
      include: {
        student: { select: { id: true, fullName: true, nisn: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
  }

  async upsertGrade(
    classroomId: string,
    userId: string,
    dto: GradeEntryDto,
  ) {
    const classroom = await this.resolveClassroom(classroomId);
    await this.access.assertRole(userId, classroom.schoolId, STAFF_ROLES);
    await this.assertStudentAndSubject(
      classroom.schoolId,
      dto.studentId,
      dto.subjectId,
    );

    const grade = await this.prisma.grade.upsert({
      where: {
        studentId_classroomId_subjectId_term: {
          studentId: dto.studentId,
          classroomId,
          subjectId: dto.subjectId,
          term: dto.term,
        },
      },
      create: {
        studentId: dto.studentId,
        classroomId,
        subjectId: dto.subjectId,
        term: dto.term,
        score: dto.score,
        note: dto.note ?? null,
      },
      update: { score: dto.score, note: dto.note ?? null },
    });

    await this.audit.log({
      schoolId: classroom.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'Grade',
      entityId: grade.id,
      metadata: { studentId: dto.studentId, subjectId: dto.subjectId },
    });
    return grade;
  }

  async bulkUpsertGrades(
    classroomId: string,
    userId: string,
    dto: BulkGradesDto,
  ) {
    const classroom = await this.resolveClassroom(classroomId);
    await this.access.assertRole(userId, classroom.schoolId, STAFF_ROLES);

    const subjectIds = [...new Set(dto.grades.map((g) => g.subjectId))];
    const [subjects, students] = await Promise.all([
      this.prisma.subject.findMany({
        where: { id: { in: subjectIds }, schoolId: classroom.schoolId },
        select: { id: true },
      }),
      this.prisma.student.findMany({
        where: {
          id: { in: [...new Set(dto.grades.map((g) => g.studentId))] },
          schoolId: classroom.schoolId,
        },
        select: { id: true },
      }),
    ]);
    if (subjects.length !== subjectIds.length) {
      throw new BadRequestException('Ada mata pelajaran yang tidak valid');
    }
    if (students.length !== [...new Set(dto.grades.map((g) => g.studentId))].length) {
      throw new BadRequestException('Ada siswa yang tidak valid');
    }

    await this.prisma.$transaction(
      dto.grades.map((g) =>
        this.prisma.grade.upsert({
          where: {
            studentId_classroomId_subjectId_term: {
              studentId: g.studentId,
              classroomId,
              subjectId: g.subjectId,
              term: g.term,
            },
          },
          create: {
            studentId: g.studentId,
            classroomId,
            subjectId: g.subjectId,
            term: g.term,
            score: g.score,
            note: g.note ?? null,
          },
          update: { score: g.score, note: g.note ?? null },
        }),
      ),
    );

    await this.audit.log({
      schoolId: classroom.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'Grade',
      entityId: classroomId,
      metadata: { count: dto.grades.length },
    });

    return { saved: dto.grades.length };
  }

  // ---------- Helper ----------

  private async resolveClassroom(classroomId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
    });
    if (!classroom) throw new NotFoundException('Kelas tidak ditemukan');
    return classroom;
  }

  private async assertStudentAndSubject(
    schoolId: string,
    studentId: string,
    subjectId: string,
  ) {
    const [student, subject] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: { schoolId: true },
      }),
      this.prisma.subject.findUnique({
        where: { id: subjectId },
        select: { schoolId: true },
      }),
    ]);
    if (!student || student.schoolId !== schoolId) {
      throw new BadRequestException('Siswa tidak valid untuk sekolah ini');
    }
    if (!subject || subject.schoolId !== schoolId) {
      throw new BadRequestException('Mata pelajaran tidak valid untuk sekolah ini');
    }
  }
}
