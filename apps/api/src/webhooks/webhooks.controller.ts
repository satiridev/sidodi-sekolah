import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/webhooks.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get('schools/:schoolId/webhooks')
  list(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.webhooks.list(schoolId, user.id);
  }

  @Post('schools/:schoolId/webhooks')
  create(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooks.create(schoolId, user.id, dto.url, dto.events);
  }

  @Delete('webhooks/:id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.webhooks.delete(id, user.id);
  }
}
