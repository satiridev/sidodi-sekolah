import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FoldersService } from './folders.service';
import {
  CreateFolderDto,
  GenerateFoldersDto,
  UpdateFolderDto,
} from './dto/folder.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get('schools/:schoolId/folders/tree')
  tree(@Param('schoolId') schoolId: string, @CurrentUser() user: JwtUser) {
    return this.folders.tree(schoolId, user.id);
  }

  @Post('schools/:schoolId/folders/generate')
  generate(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: GenerateFoldersDto,
  ) {
    return this.folders.generate(schoolId, user.id, dto);
  }

  @Get('folders/:id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.folders.get(id, user.id);
  }

  @Get('folders/:id/contents')
  contents(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.folders.contents(id, user.id);
  }

  @Post('folders')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateFolderDto) {
    return this.folders.create(dto.schoolId, user.id, dto);
  }

  @Patch('folders/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.folders.update(id, user.id, dto);
  }

  @Delete('folders/:id')
  delete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.folders.delete(id, user.id);
  }
}