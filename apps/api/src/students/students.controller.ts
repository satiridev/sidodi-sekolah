import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudentsService } from './students.service';
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  // ---------- Siswa ----------

  @Get('schools/:schoolId/students')
  listStudents(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ListStudentsDto,
  ) {
    return this.students.listStudents(schoolId, user.id, query);
  }

  @Post('schools/:schoolId/students')
  createStudent(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateStudentDto,
  ) {
    return this.students.createStudent(schoolId, user.id, dto);
  }

  @Post('schools/:schoolId/students/import')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  importStudents(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.students.importStudents(schoolId, user.id, file);
  }

  @Get('students/:id')
  getStudent(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.students.getStudent(id, user.id);
  }

  @Patch('students/:id')
  updateStudent(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.updateStudent(id, user.id, dto);
  }

  @Delete('students/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStudent(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    await this.students.removeStudent(id, user.id);
  }

  // ---------- Mata pelajaran ----------

  @Get('schools/:schoolId/subjects')
  listSubjects(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.students.listSubjects(schoolId, user.id);
  }

  @Post('schools/:schoolId/subjects')
  createSubject(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateSubjectDto,
  ) {
    return this.students.createSubject(schoolId, user.id, dto);
  }

  // ---------- Penugasan siswa ke kelas ----------

  @Get('classrooms/:id/students')
  listClassroomStudents(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.students.listClassroomStudents(id, user.id);
  }

  @Post('classrooms/:id/students')
  assignStudents(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: AssignStudentsDto,
  ) {
    return this.students.assignStudents(id, user.id, dto);
  }

  // ---------- Nilai ----------

  @Get('classrooms/:id/grades')
  listGrades(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ListGradesDto,
  ) {
    return this.students.listGrades(id, user.id, query);
  }

  @Post('classrooms/:id/grades')
  upsertGrade(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: GradeEntryDto,
  ) {
    return this.students.upsertGrade(id, user.id, dto);
  }

  @Post('classrooms/:id/grades/bulk')
  bulkUpsertGrades(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: BulkGradesDto,
  ) {
    return this.students.bulkUpsertGrades(id, user.id, dto);
  }
}
