import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ComplianceService } from './compliance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('schools/:schoolId/compliance/score')
  score(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.compliance.compute(schoolId, user.id);
  }

  @Post('schools/:schoolId/compliance/snapshot')
  snapshot(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.compliance.storeSnapshot(schoolId, user.id);
  }

  @Get('schools/:schoolId/compliance/history')
  history(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Math.min(Number(limit) || 12, 100) : 12;
    return this.compliance.history(schoolId, user.id, parsed);
  }

  @Get('schools/:schoolId/compliance/checks')
  checks(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.compliance.compute(schoolId, user.id);
  }

  @Get('schools/:schoolId/compliance/report')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="laporan-kepatuhan.csv"')
  async report(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', 'attachment; filename="laporan-kepatuhan.csv"');
    return this.compliance.csvReport(schoolId, user.id);
  }
}