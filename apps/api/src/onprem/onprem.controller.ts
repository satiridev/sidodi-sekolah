import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OnpremService } from './onprem.service';
import { AgentHeartbeatDto, RegisterAgentDto } from './dto/onprem.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
export class OnpremController {
  constructor(private readonly onprem: OnpremService) {}

  @Post('onprem/agents/register')
  @UseGuards(JwtAuthGuard)
  register(@Body() dto: RegisterAgentDto, @CurrentUser() user: JwtUser) {
    return this.onprem.register(dto.schoolId, user.id, dto.name, dto.version);
  }

  @Post('onprem/agents/:id/heartbeat')
  @HttpCode(HttpStatus.OK)
  heartbeat(@Param('id') id: string, @Body() dto: AgentHeartbeatDto) {
    return this.onprem.heartbeat(id, dto.token, dto.status);
  }

  @Get('schools/:schoolId/onprem/agents')
  @UseGuards(JwtAuthGuard)
  list(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.onprem.list(schoolId, user.id);
  }
}
