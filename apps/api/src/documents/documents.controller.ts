import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import {
  CheckDuplicateDto,
  CreateDocumentDto,
  ListDocumentsDto,
  PolicyValidateDto,
  SchedulePurgeDto,
  SetLegalHoldDto,
  UpdateDocumentDto,
} from './dto/document.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('schools/:schoolId/documents')
  @UseGuards(JwtAuthGuard)
  list(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ListDocumentsDto,
  ) {
    return this.documents.list(schoolId, user.id, query);
  }

  @Post('documents')
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateDocumentDto) {
    return this.documents.create(user.id, dto);
  }

  @Post('documents/check-duplicate')
  @UseGuards(JwtAuthGuard)
  checkDuplicate(@CurrentUser() user: JwtUser, @Body() dto: CheckDuplicateDto) {
    return this.documents.checkDuplicate(user.id, dto);
  }

  @Post('policy/validate')
  @UseGuards(JwtAuthGuard)
  validatePolicy(@CurrentUser() user: JwtUser, @Body() dto: PolicyValidateDto) {
    return this.documents.validatePolicy(user.id, dto);
  }

  @Get('documents/:id')
  @UseGuards(JwtAuthGuard)
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documents.get(id, user.id);
  }

  @Patch('documents/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.update(id, user.id, dto);
  }

  @Delete('documents/:id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documents.remove(id, user.id);
  }

  @Post('documents/:id/restore')
  @UseGuards(JwtAuthGuard)
  restore(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documents.restore(id, user.id);
  }

  @Get('documents/:id/download')
  @UseGuards(JwtAuthGuard)
  download(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documents.download(id, user.id);
  }

  @Get('documents/:id/versions')
  @UseGuards(JwtAuthGuard)
  versions(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documents.versions(id, user.id);
  }

  @Get('documents/:id/audit-trail')
  @UseGuards(JwtAuthGuard)
  auditTrail(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documents.auditTrail(id, user.id);
  }

  @Post('documents/:id/legal-hold')
  @UseGuards(JwtAuthGuard)
  setLegalHold(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SetLegalHoldDto,
  ) {
    return this.documents.setLegalHold(id, user.id, dto);
  }

  @Post('documents/:id/schedule-purge')
  @UseGuards(JwtAuthGuard)
  schedulePurge(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: SchedulePurgeDto,
  ) {
    return this.documents.schedulePurge(id, user.id, dto);
  }

  @Post('documents/:id/cancel-purge')
  @UseGuards(JwtAuthGuard)
  cancelPurge(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documents.cancelPurge(id, user.id);
  }

  /** Streaming file lokal (mode development, tanpa S3). URL dari presignedGet(). */
  @Get('files')
  @UseGuards(JwtAuthGuard)
  async streamFile(
    @Query('key') key: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    const abs = await this.documents.resolveLocalFile(key, user.id);
    res.sendFile(abs);
  }
}