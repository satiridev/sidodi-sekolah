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
import { RetentionService } from './retention.service';
import {
  ApprovePurgeDto,
  CreateRetentionRuleDto,
  RejectPurgeDto,
  RetentionSettingsDto,
  UpdateRetentionRuleDto,
} from './dto/retention.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get('schools/:schoolId/retention/queue')
  queue(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.retention.queue(schoolId, user.id);
  }

  @Get('schools/:schoolId/retention/settings')
  settings(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.retention.settings(schoolId, user.id);
  }

  @Patch('schools/:schoolId/retention/settings')
  updateSettings(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RetentionSettingsDto,
  ) {
    return this.retention.updateSettings(schoolId, user.id, dto);
  }

  @Get('schools/:schoolId/retention/rules')
  listRules(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.retention.listRules(schoolId, user.id);
  }

  @Post('schools/:schoolId/retention/rules')
  createRule(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateRetentionRuleDto,
  ) {
    return this.retention.createRule(schoolId, user.id, dto);
  }

  @Patch('retention/rules/:id')
  updateRule(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateRetentionRuleDto,
  ) {
    return this.retention.updateRule(id, user.id, dto);
  }

  @Delete('retention/rules/:id')
  deleteRule(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.retention.deleteRule(id, user.id);
  }

  @Get('schools/:schoolId/retention/preview')
  preview(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query('days') days?: string,
  ) {
    const parsed = days ? Math.min(Math.max(Number(days) || 30, 1), 3650) : 30;
    return this.retention.preview(schoolId, user.id, parsed);
  }

  @Post('schools/:schoolId/retention/enqueue')
  enqueue(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.retention.enqueueExpired(schoolId, user.id);
  }

  @Post('schools/:schoolId/retention/enqueue-all')
  enqueueAll(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query('force') force?: string,
  ) {
    return this.retention.enqueueAll(schoolId, user.id, force === 'true');
  }

  @Post('retention/scheduler/run')
  @UseGuards(JwtAuthGuard)
  runScheduler(@CurrentUser() user: JwtUser) {
    return this.retention.runScheduler(user.id);
  }

  @Post('purge-queue/:id/approve')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: ApprovePurgeDto,
  ) {
    return this.retention.approve(id, user.id, dto);
  }

  @Post('purge-queue/:id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RejectPurgeDto,
  ) {
    return this.retention.reject(id, user.id, dto);
  }
}