import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
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
    @Body() body: { url: string; events: string[] },
  ) {
    if (!body.url || !Array.isArray(body.events)) {
      throw new Error('url dan events wajib diisi');
    }
    return this.webhooks.create(schoolId, user.id, body.url, body.events);
  }

  @Delete('webhooks/:id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.webhooks.delete(id, user.id);
  }
}
