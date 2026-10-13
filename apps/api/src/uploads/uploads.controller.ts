import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { InitiateUploadDto, PartUploadDto } from './dto/upload.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('initiate')
  initiate(@CurrentUser() user: JwtUser, @Body() dto: InitiateUploadDto) {
    return this.uploads.initiate(user.id, dto);
  }

  @Post(':id/part')
  part(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: PartUploadDto,
  ) {
    return this.uploads.part(id, user.id, dto);
  }

  @Post(':id/content')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 512 * 1024 * 1024 } }),
  )
  content(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.uploads.content(id, user.id, file);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.uploads.complete(id, user.id);
  }

  @Post(':id/abort')
  abort(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.uploads.abort(id, user.id);
  }

  @Get(':id/status')
  status(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.uploads.status(id, user.id);
  }
}