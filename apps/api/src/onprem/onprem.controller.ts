import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OnpremService } from './onprem.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
export class OnpremController {
  constructor(private readonly onprem: OnpremService) {}

  @Post('onprem/agents/register')
  register(
    @Body() body: { schoolId: string; name: string; version?: string },
  ) {
    if (!body.schoolId || !body.name) {
      throw new Error('schoolId dan name wajib diisi');
    }
    return this.onprem.register(body.schoolId, body.name, body.version);
  }

  @Post('onprem/agents/:id/heartbeat')
  heartbeat(@Param('id') id: string, @Body() body?: { status?: string }) {
    return this.onprem.heartbeat(id, body?.status);
  }

  @Get('schools/:schoolId/onprem/agents')
  @UseGuards(JwtAuthGuard)
  list(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.onprem.list(schoolId, user.id);
  }
}
