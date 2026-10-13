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
import { FinanceService } from './finance.service';
import {
  CreateFinanceArchiveDto,
  FinanceExportDto,
  FinanceSummaryDto,
  ListFinanceArchivesDto,
} from './dto/finance.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('schools/:schoolId/finance/archives')
  listArchives(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ListFinanceArchivesDto,
  ) {
    return this.finance.listArchives(schoolId, user.id, query);
  }

  @Post('schools/:schoolId/finance/archives')
  createArchive(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateFinanceArchiveDto,
  ) {
    return this.finance.createArchive(schoolId, user.id, dto);
  }

  @Get('schools/:schoolId/finance/summary')
  summary(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: FinanceSummaryDto,
  ) {
    return this.finance.summary(schoolId, user.id, query);
  }

  /** Ekspor paket audit (ZIP berisi manifest + salinan berkas). */
  @Get('schools/:schoolId/finance/export')
  async export(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: FinanceExportDto,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.finance.exportPackage(
      schoolId,
      user.id,
      query,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }
}
