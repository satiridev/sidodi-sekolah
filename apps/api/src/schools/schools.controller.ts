import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SchoolsService } from './schools.service';
import {
  CreateSchoolDto,
  UpdateSchoolDto,
  UpdateSchoolSettingsDto,
} from './dto/school.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtUser, CurrentUser } from '../common/decorators';

@Controller('schools')
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateSchoolDto) {
    return this.schools.create(user.id, dto);
  }

  // Dideklarasikan sebelum :id agar 'slug' tidak tertangkap sebagai id.
  @Get('slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.schools.getBySlug(slug);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.schools.getById(id, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateSchoolDto,
  ) {
    return this.schools.update(id, user.id, dto);
  }

  @Get(':id/storage')
  @UseGuards(JwtAuthGuard)
  storage(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.schools.storage(id, user.id);
  }

  @Patch(':id/settings')
  @UseGuards(JwtAuthGuard)
  settings(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateSchoolSettingsDto,
  ) {
    return this.schools.updateSettings(id, user.id, dto);
  }
}