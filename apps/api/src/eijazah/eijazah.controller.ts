import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { EijazahService } from './eijazah.service';
import { CreateEijazahBatchDto, GenerateEijazahDto } from './dto/eijazah.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

@Controller()
@UseGuards(JwtAuthGuard)
export class EijazahController {
  constructor(private readonly eijazah: EijazahService) {}

  // ---------- Batch ----------

  @Get('schools/:schoolId/eijazah/batches')
  listBatches(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.eijazah.listBatches(schoolId, user.id);
  }

  @Post('schools/:schoolId/eijazah/batches')
  createBatch(
    @Param('schoolId') schoolId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateEijazahBatchDto,
  ) {
    return this.eijazah.createBatch(schoolId, user.id, dto);
  }

  @Get('eijazah/batches/:id')
  getBatch(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.eijazah.getBatch(id, user.id);
  }

  @Post('eijazah/batches/:id/generate')
  generate(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: GenerateEijazahDto,
  ) {
    return this.eijazah.generateBatch(id, user.id, dto);
  }

  // ---------- Sertifikat ----------

  @Post('eijazah/certificates/:id/issue')
  @HttpCode(HttpStatus.OK)
  issue(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.eijazah.issueCertificate(id, user.id);
  }

  @Post('eijazah/certificates/:id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.eijazah.revokeCertificate(id, user.id);
  }

  /** Unduh ijazah PDF (dibuat saat permintaan). */
  @Get('eijazah/certificates/:id/pdf')
  async pdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.eijazah.pdfFile(id, user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  }
}

/** Verifikasi publik — tanpa autentikasi. */
@Controller()
export class EijazahVerifyController {
  constructor(private readonly eijazah: EijazahService) {}

  @Get('verify/:serial')
  verify(@Param('serial') serial: string) {
    return this.eijazah.verify(serial);
  }
}
