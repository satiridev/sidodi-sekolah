import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { DapodikSyncDto } from './dto/integrations.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post('integrations/dapodik/sync')
  sync(@Body() dto: DapodikSyncDto, @CurrentUser() user: JwtUser) {
    return this.integrations.syncDapodik(dto.schoolId, user.id);
  }

  @Get('integrations/dapodik/syncs')
  list(@Query('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.integrations.listDapodik(schoolId, user.id);
  }
}
