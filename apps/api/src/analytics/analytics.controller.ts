import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { SchoolAnalyticsQueryDto } from './dto/analytics.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Metrik satu sekolah (anggota pengelola/auditor). */
  @Get('school')
  school(
    @CurrentUser() user: JwtUser,
    @Query() query: SchoolAnalyticsQueryDto,
  ) {
    return this.analytics.schoolMetrics(query.schoolId, user.id);
  }

  /** Metrik agregat lintas sekolah untuk yayasan/dinas. */
  @Get('network')
  network(@CurrentUser() user: JwtUser) {
    return this.analytics.networkMetrics(user.id);
  }
}
