import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AcademicService } from './academic.service';
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  // ---------- Tahun Ajaran ----------

  @Get('schools/:schoolId/academic-years')
  listYears(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.academic.listAcademicYears(schoolId, user.id);
  }

  @Post('schools/:schoolId/academic-years')
  createYear(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateAcademicYearDto,
  ) {
    return this.academic.createAcademicYear(schoolId, user.id, dto);
  }

  @Get('academic-years/:id')
  getYear(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.academic.getAcademicYear(id, user.id);
  }

  @Patch('academic-years/:id')
  updateYear(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.academic.updateAcademicYear(id, user.id, dto);
  }

  @Delete('academic-years/:id')
  deleteYear(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.academic.deleteAcademicYear(id, user.id);
  }

  @Post('academic-years/:id/activate')
  activateYear(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.academic.activateAcademicYear(id, user.id);
  }

  // ---------- Semester ----------

  @Get('academic-years/:id/semesters')
  listSemesters(@Param('id') academicYearId: string, @CurrentUser() user: JwtUser) {
    return this.academic.listSemesters(academicYearId, user.id);
  }

  @Post('academic-years/:id/semesters')
  createSemester(
    @Param('id') academicYearId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateSemesterDto,
  ) {
    return this.academic.createSemester(academicYearId, user.id, dto);
  }

  @Get('semesters/:id')
  getSemester(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.academic.getSemester(id, user.id);
  }

  @Patch('semesters/:id')
  updateSemester(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateSemesterDto,
  ) {
    return this.academic.updateSemester(id, user.id, dto);
  }

  @Delete('semesters/:id')
  deleteSemester(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.academic.deleteSemester(id, user.id);
  }

  // ---------- Kelas ----------

  @Get('schools/:schoolId/classrooms')
  listClassrooms(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.academic.listClassrooms(schoolId, user.id, academicYearId);
  }

  @Post('schools/:schoolId/classrooms')
  createClassroom(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateClassroomDto,
  ) {
    return this.academic.createClassroom(schoolId, user.id, dto);
  }

  @Get('classrooms/:id')
  getClassroom(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.academic.getClassroom(id, user.id);
  }

  @Patch('classrooms/:id')
  updateClassroom(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateClassroomDto,
  ) {
    return this.academic.updateClassroom(id, user.id, dto);
  }

  @Delete('classrooms/:id')
  deleteClassroom(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.academic.deleteClassroom(id, user.id);
  }

  // ---------- Jenis Dokumen ----------

  @Get('schools/:schoolId/document-types')
  listDocumentTypes(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.academic.listDocumentTypes(schoolId, user.id);
  }

  @Post('schools/:schoolId/document-types')
  createDocumentType(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateDocumentTypeDto,
  ) {
    return this.academic.createDocumentType(schoolId, user.id, dto);
  }

  @Get('document-types/:id')
  getDocumentType(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.academic.getDocumentType(id, user.id, schoolId);
  }

  @Patch('document-types/:id')
  updateDocumentType(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.academic.updateDocumentType(id, user.id, dto);
  }

  @Delete('document-types/:id')
  deleteDocumentType(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.academic.deleteDocumentType(id, user.id);
  }
}