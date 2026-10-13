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
import { MembersService } from './members.service';
import {
  AcceptInvitationDto,
  InviteMemberDto,
  ListMembersDto,
  UpdateMembershipDto,
} from './dto/member.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('schools/:schoolId/members')
  @UseGuards(JwtAuthGuard)
  list(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: ListMembersDto,
  ) {
    return this.members.list(schoolId, user.id, query);
  }

  @Post('schools/:schoolId/members')
  @UseGuards(JwtAuthGuard)
  invite(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.members.invite(schoolId, user.id, dto);
  }

  @Patch('members/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.members.update(id, user.id, dto);
  }

  @Delete('members/:id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.members.remove(id, user.id);
  }

  @Post('members/accept')
  @UseGuards(JwtAuthGuard)
  accept(@Body() dto: AcceptInvitationDto, @CurrentUser() user: JwtUser) {
    return this.members.accept(dto, user.id);
  }
}