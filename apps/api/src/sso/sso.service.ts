import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { UpdateSsoConfigDto } from './dto/sso.dto';

@Injectable()
export class SsoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async getConfig(schoolId: string, userId: string) {
    await this.access.assertRole(userId, schoolId, [
      'headmaster',
      'head_of_administration',
    ]);
    let config = await this.prisma.schoolSsoConfig.findFirst({
      where: { schoolId, provider: 'google_belajar_id' },
    });
    if (!config) {
      config = await this.prisma.schoolSsoConfig.create({
        data: {
          schoolId,
          provider: 'google_belajar_id',
          domain: '',
          clientId: this.config.get<string>('GOOGLE_CLIENT_ID') ?? '',
          autoJoin: false,
          defaultRole: 'operator',
          isActive: false,
        },
      });
    }
    return config;
  }

  async updateConfig(schoolId: string, userId: string, dto: UpdateSsoConfigDto) {
    const actor = await this.access.assertRole(userId, schoolId, [
      'headmaster',
      'head_of_administration',
    ]);
    let config = await this.prisma.schoolSsoConfig.findFirst({
      where: { schoolId, provider: 'google_belajar_id' },
    });
    if (!config) {
      config = await this.prisma.schoolSsoConfig.create({
        data: {
          schoolId,
          provider: 'google_belajar_id',
          domain: dto.domain ?? '',
          clientId: dto.clientId ?? '',
          autoJoin: dto.autoJoin ?? false,
          defaultRole: dto.defaultRole ?? 'operator',
          isActive: dto.isActive ?? false,
        },
      });
    } else {
      config = await this.prisma.schoolSsoConfig.update({
        where: { id: config.id },
        data: {
          domain: dto.domain,
          clientId: dto.clientId,
          autoJoin: dto.autoJoin,
          defaultRole: dto.defaultRole,
          isActive: dto.isActive,
        },
      });
    }
    await this.audit.log({
      schoolId,
      actorUserId: userId,
      actorMembershipId: actor.id,
      action: 'update',
      entityType: 'SchoolSsoConfig',
      entityId: config.id,
    });
    return config;
  }
}
