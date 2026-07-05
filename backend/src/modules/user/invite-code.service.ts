import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InviteCodeEntity } from './entities/invite-code.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';

/**
 * 邀请码服务
 * 数据合同真源：Task 5 - 邀请码生成与管理服务
 *
 * 邀请码格式：8 字符 base32（大写字母 + 数字，去除易混淆字符）
 * 有效期：30 天
 */
@Injectable()
export class InviteCodeService {
  /** base32 字符集（去除 0/O/1/I 等易混淆字符） */
  private static readonly CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  /** 邀请码长度 */
  private static readonly CODE_LENGTH = 8;
  /** 有效期（天） */
  private static readonly EXPIRE_DAYS = 30;

  constructor(
    @InjectRepository(InviteCodeEntity)
    private inviteCodeRepo: Repository<InviteCodeEntity>,
  ) {}

  /**
   * 生成邀请码
   * @param inviterId 邀请人 ID
   */
  async generateCode(inviterId: number): Promise<InviteCodeEntity> {
    const code = await this.generateRandomCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + InviteCodeService.EXPIRE_DAYS);

    const entity = this.inviteCodeRepo.create({
      code,
      inviterId,
      inviteeId: null,
      status: 'active',
      expiresAt,
    });
    return this.inviteCodeRepo.save(entity);
  }

  /**
   * 校验邀请码有效性（不消费）
   * @param code 邀请码
   * @returns 邀请码实体（有效）或 null（无效）
   */
  async validateCode(code: string): Promise<InviteCodeEntity | null> {
    const entity = await this.inviteCodeRepo.findOne({ where: { code } });
    if (!entity) return null;
    if (entity.status !== 'active') return null;
    if (entity.expiresAt.getTime() < Date.now()) return null;
    return entity;
  }

  /**
   * 消费邀请码（注册成功后调用）
   * @param code 邀请码
   * @param inviteeId 被邀请人 ID
   */
  async consumeCode(code: string, inviteeId: number): Promise<void> {
    const entity = await this.inviteCodeRepo.findOne({ where: { code } });
    if (!entity) {
      BusinessException.throw(ErrorCode.INVITE_CODE_INVALID);
    }
    if (entity.status === 'used') {
      BusinessException.throw(ErrorCode.INVITE_CODE_USED);
    }
    if (entity.expiresAt.getTime() < Date.now()) {
      BusinessException.throw(ErrorCode.INVITE_CODE_EXPIRED);
    }
    entity.inviteeId = inviteeId;
    entity.status = 'used';
    await this.inviteCodeRepo.save(entity);
  }

  /**
   * 查询我的邀请码列表
   * @param inviterId 邀请人 ID
   */
  async listMyCodes(inviterId: number): Promise<InviteCodeEntity[]> {
    return this.inviteCodeRepo.find({
      where: { inviterId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 邀请统计
   * @param inviterId 邀请人 ID
   */
  async getInviteStats(
    inviterId: number,
  ): Promise<{ total: number; used: number; active: number }> {
    const list = await this.inviteCodeRepo.find({ where: { inviterId } });
    const used = list.filter((c) => c.status === 'used').length;
    const active = list.filter(
      (c) => c.status === 'active' && c.expiresAt.getTime() > Date.now(),
    ).length;
    return { total: list.length, used, active };
  }

  /** 生成随机邀请码（确保唯一性） */
  private async generateRandomCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateCodeString();
      const exists = await this.inviteCodeRepo.findOne({ where: { code } });
      if (!exists) return code;
    }
    // 极小概率冲突，直接返回（数据库 unique 约束兜底）
    return this.generateCodeString();
  }

  /** 生成单个邀请码字符串 */
  private generateCodeString(): string {
    const chars = InviteCodeService.CHARSET;
    let result = '';
    for (let i = 0; i < InviteCodeService.CODE_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
