import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { SsoService } from './sso.service';
import { UpdateSsoConfigDto } from './dto/sso.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  @Get('schools/:schoolId/sso')
  getConfig(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.sso.getConfig(schoolId, user.id);
  }

  @Patch('schools/:schoolId/sso')
  updateConfig(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateSsoConfigDto,
  ) {
    return this.sso.updateConfig(schoolId, user.id, dto);
  }
}
