import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { StorageService } from '../storage/storage.service';
import {
  GenerateReportCardsDto,
  ListReportCardsDto,
} from './dto/report.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly storage: StorageService,
  ) {}

  @Get('classrooms/:id/report-cards')
  list(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ListReportCardsDto,
  ) {
    return this.reports.listForClassroom(id, user.id, query);
  }

  @Post('classrooms/:id/report-cards/generate')
  generate(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: GenerateReportCardsDto,
  ) {
    return this.reports.generateForClassroom(id, user.id, dto);
  }

  /** Unduh raport PDF. Mode lokal: stream berkas; mode S3: redirect presigned. */
  @Get('report-cards/:id/pdf')
  async pdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    const { key, fileName } = await this.reports.pdfFile(id, user.id);

    if (this.storage.isRemote) {
      const url = await this.storage.presignedGet(key);
      res.redirect(302, url);
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(this.storage.readLocal(key));
  }
}
