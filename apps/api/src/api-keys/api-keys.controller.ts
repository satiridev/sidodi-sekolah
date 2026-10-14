import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-keys.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get('schools/:schoolId/api-keys')
  list(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.apiKeys.list(schoolId, user.id);
  }

  @Post('schools/:schoolId/api-keys')
  create(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(schoolId, user.id, dto.name, dto.scopes);
  }

  @Delete('api-keys/:id')
  revoke(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.apiKeys.revoke(id, user.id);
  }
}
