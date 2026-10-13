import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MembershipStatus, UserRole } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcceptInvitationDto,
  InviteMemberDto,
  ListMembersDto,
  UpdateMembershipDto,
} from './dto/member.dto';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(schoolId: string, userId: string, query: ListMembersDto) {
    await this.access.membership(userId, schoolId);

    const where = {
      schoolId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, name: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.membership.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async invite(schoolId: string, userId: string, dto: InviteMemberDto) {
    await this.access.assertRole(userId, schoolId, [
      'headmaster',
      'head_of_administration',
    ]);

    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.email.split('@')[0],
          isEmailVerified: false,
        },
      });
    }

    const member = await this.prisma.membership.upsert({
      where: { schoolId_userId: { schoolId, userId: user.id } },
      update: {
        role: dto.role,
        status: 'invited',
        invitedBy: userId,
        invitationToken: randomBytes(24).toString('hex'),
        invitationExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        joinedAt: undefined,
      },
      create: {
        schoolId,
        userId: user.id,
        role: dto.role,
        status: 'invited',
        invitedBy: userId,
        invitationToken: randomBytes(24).toString('hex'),
        invitationExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });

    await this.audit.log({
      schoolId,
      actorUserId: userId,
      action: 'permission_change',
      entityType: 'Membership',
      entityId: member.id,
    });

    return member;
  }

  async update(
    membershipId: string,
    userId: string,
    dto: UpdateMembershipDto,
  ) {
    const member = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!member) throw new NotFoundException('Anggota tidak ditemukan');

    const actor = await this.access.assertRole(userId, member.schoolId, [
      'headmaster',
      'head_of_administration',
    ]);
    // Hanya headmaster yang boleh mengubah role headmaster/admin lain.
    if (
      actor.role !== 'headmaster' &&
      (member.role === 'headmaster' || member.role === 'head_of_administration')
    ) {
      throw new ForbiddenException('Hanya kepala sekolah yang dapat mengubah anggota ini');
    }
    if (dto.status === 'suspended' && member.role === 'headmaster') {
      throw new ForbiddenException('Tidak dapat menonaktifkan kepala sekolah');
    }

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { ...dto, joinedAt: dto.status === 'active' ? new Date() : undefined },
    });

    await this.audit.log({
      schoolId: member.schoolId,
      actorUserId: userId,
      action: 'permission_change',
      entityType: 'Membership',
      entityId: membershipId,
      metadata: { dto },
    });

    return updated;
  }

  async remove(membershipId: string, userId: string) {
    const member = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!member) throw new NotFoundException('Anggota tidak ditemukan');
    await this.access.assertRole(userId, member.schoolId, ['headmaster']);
    if (member.role === 'headmaster') {
      throw new ForbiddenException('Tidak dapat menghapus kepala sekolah');
    }

    await this.prisma.membership.delete({ where: { id: membershipId } });
    await this.audit.log({
      schoolId: member.schoolId,
      actorUserId: userId,
      action: 'permission_change',
      entityType: 'Membership',
      entityId: membershipId,
      metadata: { removed: true },
    });
    return { success: true };
  }

  async accept(dto: AcceptInvitationDto, userId: string) {
    const invitation = await this.prisma.membership.findFirst({
      where: {
        invitationToken: dto.token,
        status: 'invited',
        invitationExpiresAt: { gt: new Date() },
      },
    });
    if (!invitation) {
      throw new BadRequestException('Undangan tidak valid atau sudah kedaluwarsa');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // Token boleh dipakai siapa pun yang memegangnya; tautan email seharusnya
    // mengautentikasi user yang sama. Di sini kita samakan email.
    if (user && invitation.userId !== userId) {
      const invitedUser = await this.prisma.user.findUnique({
        where: { id: invitation.userId },
      });
      if (user.email.toLowerCase() !== invitedUser?.email?.toLowerCase()) {
        throw new ForbiddenException('Undangan ditujukan untuk email lain');
      }
    }

    const accepted = await this.prisma.membership.update({
      where: { id: invitation.id },
      data: {
        status: MembershipStatus.active,
        joinedAt: new Date(),
        invitationToken: null,
        invitationExpiresAt: null,
      },
    });

    await this.audit.log({
      schoolId: invitation.schoolId,
      actorUserId: userId,
      action: 'update',
      entityType: 'Membership',
      entityId: invitation.id,
      metadata: { acceptedInvitation: true },
    });

    return accepted;
  }
}