import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MB = 1024 * 1024;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function findOrCreateDocumentType(
  schoolId: string | null,
  data: {
    code: string;
    name: string;
    description?: string;
    retentionType: 'financial_5y' | 'academic_permanent' | 'custom';
    retentionMonths: number | null;
    allowedExtensions: string[];
    requiresLegalHold: boolean;
  },
) {
  const existing = await prisma.documentType.findFirst({
    where: { schoolId, code: data.code },
  });
  if (existing) {
    return prisma.documentType.update({ where: { id: existing.id }, data });
  }
  return prisma.documentType.create({
    data: {
      ...data,
      schoolId,
      isSystem: schoolId === null,
      maxSizeBytes: BigInt(100 * MB),
    },
  });
}

async function findOrCreateFolder(
  schoolId: string,
  name: string,
  path: string,
  parentId: string | null,
  extra: {
    academicYearId?: string | null;
    semesterId?: string | null;
    classroomId?: string | null;
    documentTypeId?: string | null;
  } = {},
) {
  const existing = await prisma.folder.findFirst({
    where: { schoolId, parentId, name },
  });
  if (existing) return existing;
  return prisma.folder.create({
    data: { schoolId, parentId, name, path, ...extra },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('🌱 Mulai seeding...');

  // 1. Plans ------------------------------------------------------------------
  const plans = [
    { code: 'trial' as const, name: 'Trial', priceYearlyIdr: 0, storageQuotaBytes: BigInt(2 * 1024 * MB), maxUsers: 10 },
    { code: 'basic' as const, name: 'Basic', priceYearlyIdr: 2_500_000, storageQuotaBytes: BigInt(50 * 1024 * MB), maxUsers: 50 },
    { code: 'pro' as const, name: 'Pro', priceYearlyIdr: 7_500_000, storageQuotaBytes: BigInt(250 * 1024 * MB), maxUsers: 300 },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: p,
      create: { ...p, isActive: true, features: { multiSchool: p.code === 'pro' } },
    });
  }
  console.log(`  ✓ ${plans.length} paket langganan`);

  // 2. Sekolah demo -----------------------------------------------------------
  const school = await prisma.school.upsert({
    where: { slug: 'sma-contoh-nusantara' },
    update: {},
    create: {
      name: 'SMA Contoh Nusantara',
      slug: 'sma-contoh-nusantara',
      npsn: '12345678',
      address: 'Jl. Pendidikan No. 1',
      city: 'Bandung',
      province: 'Jawa Barat',
      email: 'info@sma-contoh.sch.id',
      planCode: 'trial',
      storageQuotaBytes: BigInt(2 * 1024 * MB),
      maxFileSizeBytes: BigInt(100 * MB),
    },
  });
  console.log(`  ✓ Sekolah: ${school.name}`);

  // 3. User + Membership ------------------------------------------------------
  // Catatan: password_hash dibiarkan null pada demo (login via undangan/SSO).
  const users = [
    { email: 'kepsek@sma-contoh.sch.id', name: 'Kepala Sekolah', role: 'headmaster' as const },
    { email: 'ketua-tu@sma-contoh.sch.id', name: 'Kepala Tata Usaha', role: 'head_of_administration' as const },
    { email: 'guru@sma-contoh.sch.id', name: 'Guru Contoh', role: 'teacher' as const },
    { email: 'operator@sma-contoh.sch.id', name: 'Operator Sekolah', role: 'operator' as const },
    { email: 'auditor@sma-contoh.sch.id', name: 'Auditor Internal', role: 'auditor' as const },
  ];

  const memberships: Record<string, string> = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, isEmailVerified: true },
      create: { email: u.email, name: u.name, isEmailVerified: true },
    });
    const membership = await prisma.membership.upsert({
      where: { schoolId_userId: { schoolId: school.id, userId: user.id } },
      update: { role: u.role, status: 'active' },
      create: {
        schoolId: school.id,
        userId: user.id,
        role: u.role,
        status: 'active',
        joinedAt: new Date(),
      },
    });
    memberships[u.role] = membership.id;
  }
  console.log(`  ✓ ${users.length} user + membership`);

  // 4. Jenis dokumen (policy retensi & ekstensi) ------------------------------
  const docTypes: {
    code: string;
    name: string;
    description: string;
    retentionType: 'financial_5y' | 'academic_permanent' | 'custom';
    retentionMonths: number | null;
    allowedExtensions: string[];
    requiresLegalHold: boolean;
  }[] = [
    { code: 'IJAZAH', name: 'Ijazah', description: 'Ijazah kelulusan (E-Ijazah)', retentionType: 'academic_permanent', retentionMonths: null, allowedExtensions: ['pdf'], requiresLegalHold: true },
    { code: 'RAPORT', name: 'Raport', description: 'Raport hasil belajar', retentionType: 'academic_permanent', retentionMonths: null, allowedExtensions: ['pdf', 'docx', 'xlsx'], requiresLegalHold: false },
    { code: 'TRANSKRIP', name: 'Transkrip Nilai', description: 'Transkrip nilai siswa', retentionType: 'academic_permanent', retentionMonths: null, allowedExtensions: ['pdf', 'xlsx'], requiresLegalHold: false },
    { code: 'LEGALISIR', name: 'Legalisir', description: 'Dokumen legalisir', retentionType: 'academic_permanent', retentionMonths: null, allowedExtensions: ['pdf'], requiresLegalHold: true },
    { code: 'KEUANGAN_BOS', name: 'Arsip Keuangan & Dana BOS', description: 'SPJ, kuitansi, laporan BOS (retensi 5 tahun)', retentionType: 'financial_5y', retentionMonths: 60, allowedExtensions: ['pdf', 'xlsx', 'docx', 'jpg', 'jpeg', 'png'], requiresLegalHold: true },
    { code: 'RKAS', name: 'RKAS', description: 'Rencana Kegiatan dan Anggaran Sekolah', retentionType: 'financial_5y', retentionMonths: 60, allowedExtensions: ['pdf', 'xlsx'], requiresLegalHold: false },
    { code: 'SK', name: 'Surat Keputusan', description: 'SK Kepala Sekolah / Yayasan', retentionType: 'custom', retentionMonths: 120, allowedExtensions: ['pdf', 'docx'], requiresLegalHold: true },
    { code: 'SURAT_MASUK', name: 'Surat Masuk', description: 'Arsip surat masuk', retentionType: 'custom', retentionMonths: 24, allowedExtensions: ['pdf', 'jpg', 'png'], requiresLegalHold: false },
    { code: 'SURAT_KELUAR', name: 'Surat Keluar', description: 'Arsip surat keluar', retentionType: 'custom', retentionMonths: 24, allowedExtensions: ['pdf', 'docx'], requiresLegalHold: false },
    { code: 'DATA_SISWA', name: 'Data Siswa', description: 'Data pokok siswa', retentionType: 'academic_permanent', retentionMonths: null, allowedExtensions: ['pdf', 'xlsx', 'csv'], requiresLegalHold: true },
    { code: 'SARPRAS', name: 'Sarana & Prasarana', description: 'Dokumen sarana prasarana', retentionType: 'custom', retentionMonths: 60, allowedExtensions: ['pdf', 'xlsx', 'jpg', 'png'], requiresLegalHold: false },
    { code: 'MOU', name: 'MoU / Kerja Sama', description: 'Naskah kerja sama', retentionType: 'custom', retentionMonths: 120, allowedExtensions: ['pdf', 'docx'], requiresLegalHold: true },
  ];

  const docTypeByName: Record<string, { id: string }> = {};
  for (const dt of docTypes) {
    // Jenis dokumen standar dibuat sebagai tipe sistem (schoolId null) agar
    // tersedia untuk semua sekolah yang mendaftar secara self-serve.
    const created = await findOrCreateDocumentType(null, dt);
    docTypeByName[dt.name] = { id: created.id };
  }
  console.log(`  ✓ ${docTypes.length} jenis dokumen (sistem)`);

  // 5. Tahun ajaran + semester ------------------------------------------------
  const academicYear = await prisma.academicYear.upsert({
    where: { schoolId_name: { schoolId: school.id, name: '2025/2026' } },
    update: { isActive: true },
    create: {
      schoolId: school.id,
      name: '2025/2026',
      startDate: new Date('2025-07-01'),
      endDate: new Date('2026-06-30'),
      isActive: true,
    },
  });

  const semesterData = [
    { name: 'Ganjil', term: 'odd' as const, startDate: new Date('2025-07-01'), endDate: new Date('2025-12-31'), isActive: true },
    { name: 'Genap', term: 'even' as const, startDate: new Date('2026-01-01'), endDate: new Date('2026-06-30'), isActive: false },
  ];
  const semesters: { id: string; name: string }[] = [];
  for (const s of semesterData) {
    let sem = await prisma.semester.findFirst({
      where: { academicYearId: academicYear.id, name: s.name },
    });
    if (!sem) {
      sem = await prisma.semester.create({
        data: { academicYearId: academicYear.id, ...s },
      });
    }
    semesters.push({ id: sem.id, name: sem.name });
  }
  console.log(`  ✓ Tahun ajaran 2025/2026 + ${semesters.length} semester`);

  // 6. Kelas ------------------------------------------------------------------
  const classroomNames = ['7A', '7B', '8A', '8B', '9A', '9B'];
  const classrooms: { id: string; name: string }[] = [];
  for (const name of classroomNames) {
    const gradeLevel = Number(name[0]);
    const classroom = await prisma.classroom.upsert({
      where: {
        schoolId_academicYearId_name: {
          schoolId: school.id,
          academicYearId: academicYear.id,
          name,
        },
      },
      update: {},
      create: { schoolId: school.id, academicYearId: academicYear.id, name, gradeLevel },
    });
    classrooms.push({ id: classroom.id, name: classroom.name });
  }
  // Wali kelas untuk 7A (guru)
  await prisma.classroom.update({
    where: { id: classrooms[0].id },
    data: { homeroomTeacherMembershipId: memberships['teacher'] },
  });
  console.log(`  ✓ ${classrooms.length} kelas`);

  // 7. Struktur folder otomatis (TA > Semester > Kelas > Jenis) ---------------
  const rootFolder = await findOrCreateFolder(
    school.id,
    academicYear.name,
    academicYear.name,
    null,
    { academicYearId: academicYear.id },
  );

  let folderCount = 0;
  for (const sem of semesters) {
    const semFolder = await findOrCreateFolder(
      school.id,
      sem.name,
      `${rootFolder.path}/${sem.name}`,
      rootFolder.id,
      { academicYearId: academicYear.id, semesterId: sem.id },
    );
    folderCount++;

    // kelas 7A contoh (representatif)
    const cls = classrooms[0];
    const clsFolder = await findOrCreateFolder(
      school.id,
      cls.name,
      `${semFolder.path}/${cls.name}`,
      semFolder.id,
      { academicYearId: academicYear.id, semesterId: sem.id, classroomId: cls.id },
    );
    folderCount++;

    for (const typeName of ['Ijazah', 'Raport', 'Arsip Keuangan & Dana BOS']) {
      const dt = docTypeByName[typeName];
      await findOrCreateFolder(
        school.id,
        typeName,
        `${clsFolder.path}/${typeName}`,
        clsFolder.id,
        {
          academicYearId: academicYear.id,
          semesterId: sem.id,
          classroomId: cls.id,
          documentTypeId: dt?.id ?? null,
        },
      );
      folderCount++;
    }
  }

  // Administrasi umum
  const adminFolder = await findOrCreateFolder(
    school.id,
    'Administrasi Umum',
    `${rootFolder.path}/Administrasi Umum`,
    rootFolder.id,
    { academicYearId: academicYear.id },
  );
  folderCount++;
  for (const typeName of ['Surat Keputusan', 'Surat Masuk', 'Surat Keluar']) {
    await findOrCreateFolder(
      school.id,
      typeName,
      `${adminFolder.path}/${typeName}`,
      adminFolder.id,
      { academicYearId: academicYear.id, documentTypeId: docTypeByName[typeName]?.id ?? null },
    );
    folderCount++;
  }
  console.log(`  ✓ ${folderCount} folder (struktur otomatis)`);

  // 8. Aturan retensi otomatis -------------------------------------------------
  for (const dt of docTypes) {
    const typeId = docTypeByName[dt.name].id;
    const existing = await prisma.retentionRule.findFirst({
      where: { schoolId: school.id, documentTypeId: typeId },
    });
    const payload = {
      schoolId: school.id,
      documentTypeId: typeId,
      retentionMonths: dt.retentionMonths,
      action: 'purge' as const,
      notifyDaysBefore: [30, 7, 1],
      requiresApproval: true,
      isActive: true,
    };
    if (existing) {
      await prisma.retentionRule.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.retentionRule.create({ data: payload });
    }
  }
  console.log(`  ✓ ${docTypes.length} aturan retensi`);

  // 9. Mata pelajaran + siswa + nilai (contoh E-Raport) -----------------------
  const subjects = [
    { name: 'Matematika', code: 'MTK' },
    { name: 'Bahasa Indonesia', code: 'BIN' },
    { name: 'Ilmu Pengetahuan Alam', code: 'IPA' },
  ];
  const subjectIds: string[] = [];
  for (const s of subjects) {
    const subj = await prisma.subject.upsert({
      where: { schoolId_code: { schoolId: school.id, code: s.code } },
      update: { name: s.name },
      create: { schoolId: school.id, ...s },
    });
    subjectIds.push(subj.id);
  }

  const studentsSeed = [
    { nisn: '0012345671', fullName: 'Aditya Pratama', gender: 'L' },
    { nisn: '0012345672', fullName: 'Bunga Lestari', gender: 'P' },
    { nisn: '0012345673', fullName: 'Cahyo Nugroho', gender: 'L' },
  ];
  const classroom7A = classrooms[0];
  for (const st of studentsSeed) {
    let student = await prisma.student.findFirst({
      where: { schoolId: school.id, nisn: st.nisn },
    });
    if (!student) {
      student = await prisma.student.create({
        data: { schoolId: school.id, status: 'active', ...st },
      });
    }
    // Hubungkan siswa ke kelas 7A
    const existingLink = await prisma.studentClassroom.findFirst({
      where: { studentId: student.id, classroomId: classroom7A.id, academicYearId: academicYear.id },
    });
    if (!existingLink) {
      await prisma.studentClassroom.create({
        data: { studentId: student.id, classroomId: classroom7A.id, academicYearId: academicYear.id },
      });
    }
    // Nilai contoh (Ganjil)
    for (const subjectId of subjectIds) {
      const existingGrade = await prisma.grade.findFirst({
        where: { studentId: student.id, classroomId: classroom7A.id, subjectId, term: 'odd' },
      });
      if (!existingGrade) {
        await prisma.grade.create({
          data: {
            studentId: student.id,
            classroomId: classroom7A.id,
            subjectId,
            term: 'odd',
            score: 80 + Math.floor(Math.random() * 16),
          },
        });
      }
    }
  }
  console.log(`  ✓ ${subjects.length} mapel, ${studentsSeed.length} siswa + nilai`);

  // 10. Snapshot skor kepatuhan awal ------------------------------------------
  const existingSnapshot = await prisma.complianceSnapshot.findFirst({
    where: { schoolId: school.id },
  });
  if (!existingSnapshot) {
    await prisma.complianceSnapshot.create({
      data: {
        schoolId: school.id,
        score: 72.5,
        breakdown: {
          folderRapi: 80,
          fileCompliant: 75,
          aksesTerkontrol: 70,
          backupAktif: 65,
        },
      },
    });
  }
  console.log('  ✓ snapshot skor kepatuhan awal');

  console.log('\n✅ Seeding selesai.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
