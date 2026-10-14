import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class OcrController {
  constructor(private readonly ocr: OcrService) {}

  @Post('documents/:id/ocr/reprocess')
  reprocess(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ocr.reprocess(id, user.id);
  }

  @Get('documents/:id/ocr/status')
  status(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ocr.status(id, user.id);
  }

  @Get('documents/:id/extracted-text')
  extracted(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ocr.getExtractedText(id, user.id);
  }

  @Post('schools/:schoolId/ocr/run')
  run(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.ocr.runForSchool(schoolId, user.id);
  }
}
