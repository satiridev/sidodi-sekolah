import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { BackupsService } from './backups.service';
import { UpdateBackupConfigDto } from './dto/backups.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get('schools/:schoolId/backups/config')
  getConfig(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.backups.getConfig(schoolId, user.id);
  }

  @Patch('schools/:schoolId/backups/config')
  updateConfig(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateBackupConfigDto,
  ) {
    return this.backups.updateConfig(schoolId, user.id, dto);
  }

  @Post('schools/:schoolId/backups/run')
  @HttpCode(HttpStatus.ACCEPTED)
  run(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.backups.runManual(schoolId, user.id);
  }

  @Get('schools/:schoolId/backups/jobs')
  jobs(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.backups.listJobs(schoolId, user.id);
  }
}
