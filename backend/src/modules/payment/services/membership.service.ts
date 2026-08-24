/**
 * 会员服务（M7-2）
 *
 * 职责：
 * - GET /membership/status：会员等级 + features 下发 + 到期自动降级（免费档）+ 7 天宽限期
 * - 兑换码：生成（批量）/ 兑换（开通/续期）/ 作废
 * - ensureFeature：服务端强制闸门（MEMBERSHIP_REQUIRED / FEATURE_LOCKED）
 *
 * 特性模型（单一来源 featuresForLevel，与方案 §7.2 对齐）：
 * | 等级       | voiceClone | 数字人形象 | 发布能力      | 水印 | 月生成上限 |
 * | 免费       | 锁         | 2 个       | 仅导出       | 有   | 3 条       |
 * | 专业       | 3 个克隆   | 全部       | 导出+发布包  | 无   | 不限       |
 * | 企业       | 不限       | 全部+私有  | API 直连     | 无   | 不限       |
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { UserMembershipEntity, MembershipLevel, MembershipStatus } from '../entities/user-membership.entity';
import { RedeemCodeEntity } from '../entities/redeem-code.entity';

/** 到期宽限期（天）：期内产物保留、余额冻结由 credits 侧处理 */
export const GRACE_PERIOD_DAYS = 7;

export interface MembershipFeatures {
  /** 声音克隆：false=锁（预设声音），数字=允许克隆数量，'unlimited'=不限 */
  voiceClone: boolean | number | 'unlimited';
  /** 数字人形象：数量 / 'all' 全部 / 'all_private' 全部+私有 */
  digitalHumans: number | 'all' | 'all_private';
  /** 发布能力：仅导出 / 导出+发布包 / API 直连 */
  publish: 'export_only' | 'full' | 'api';
  /** 是否含水印 */
  watermark: boolean;
  /** 月生成上限（条），null=不限 */
  monthlyLimit: number | null;
  /** 每月 Credits 发放（pro=500，free/enterprise 自定义池） */
  creditsPerMonth: number;
}

export interface MembershipStatusView {
  level: MembershipLevel;
  status: MembershipStatus;
  features: MembershipFeatures;
  expiresAt: Date | null;
  /** 到期宽限剩余天数（0 = 无宽限） */
  graceDaysLeft: number;
}

export type MembershipFeatureName =
  | 'create_job'
  | 'voice_clone'
  | 'digital_human'
  | 'export_package'
  | 'export_publish';

/** 等级默认特性（单一事实来源） */
export function featuresForLevel(level: MembershipLevel): MembershipFeatures {
  switch (level) {
    case 'pro':
      return {
        voiceClone: 3,
        digitalHumans: 'all',
        publish: 'full',
        watermark: false,
        monthlyLimit: null,
        creditsPerMonth: 500,
      };
    case 'enterprise':
      return {
        voiceClone: 'unlimited',
        digitalHumans: 'all_private',
        publish: 'api',
        watermark: false,
        monthlyLimit: null,
        creditsPerMonth: 0,
      };
    case 'free':
    default:
      return {
        voiceClone: false,
        digitalHumans: 2,
        publish: 'export_only',
        watermark: true,
        monthlyLimit: 3,
        creditsPerMonth: 0,
      };
  }
}

/** 仅付费功能集合（免费档命中 → MEMBERSHIP_REQUIRED） */
const PAID_ONLY_FEATURES: ReadonlySet<MembershipFeatureName> = new Set(['voice_clone', 'export_publish']);

/** 功能闸门：features → 是否可用 */
const FEATURE_GATES: Record<MembershipFeatureName, (f: MembershipFeatures) => boolean> = {
  create_job: () => true,
  voice_clone: (f) => f.voiceClone !== false,
  digital_human: (f) => f.digitalHumans !== 0,
  export_package: () => true,
  export_publish: (f) => f.publish !== 'export_only',
};

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(UserMembershipEntity)
    private readonly membershipRepo: Repository<UserMembershipEntity>,
    @InjectRepository(RedeemCodeEntity)
    private readonly redeemRepo: Repository<RedeemCodeEntity>,
  ) {}

  /** 会员状态：到期自动降级免费（静默），返回宽限天数 */
  async getStatus(userId: number): Promise<MembershipStatusView> {
    const row = await this.membershipRepo.findOne({ where: { userId } });
    const now = new Date();
    if (!row || row.level === 'free') {
      return this.view('free', 'active', null, 0);
    }
    if (row.status === 'cancelled') {
      return this.view('free', 'cancelled', row.expiresAt ?? null, 0);
    }
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
      const graceMs = row.expiresAt.getTime() + GRACE_PERIOD_DAYS * 86400000 - now.getTime();
      const graceDaysLeft = Math.max(0, Math.ceil(graceMs / 86400000));
      return this.view('free', 'expired', row.expiresAt, graceDaysLeft);
    }
    return this.view(row.level, row.status, row.expiresAt ?? null, 0);
  }

  /** 服务端强制闸门：功能不可用 / 免费档付费功能 → 抛业务异常 */
  async ensureFeature(
    userId: number,
    feature: MembershipFeatureName,
    opts: { monthCount?: number } = {},
  ): Promise<MembershipStatusView> {
    const status = await this.getStatus(userId);
    const f = status.features;
    if (!FEATURE_GATES[feature](f)) {
      if (status.level === 'free' && PAID_ONLY_FEATURES.has(feature)) {
        throw new BusinessException(ErrorCode.MEMBERSHIP_REQUIRED, '该功能需要开通会员（' + feature + '）');
      }
      throw new BusinessException(ErrorCode.FEATURE_LOCKED, '功能未开放（' + feature + '）');
    }
    if (feature === 'create_job' && f.monthlyLimit && (opts.monthCount ?? 0) >= f.monthlyLimit) {
      throw new BusinessException(
        ErrorCode.FEATURE_LOCKED,
        '免费档月生成上限 ' + f.monthlyLimit + ' 条，请升级专业版解锁',
      );
    }
    return status;
  }

  /** 兑换码兑换：校验 → 开通/续期会员 → 标记已使用（幂等：同一用户重复兑换同码直接返回状态） */
  async redeem(userId: number, code: string): Promise<MembershipStatusView> {
    const normalized = String(code ?? '').trim().toUpperCase();
    if (!normalized) throw new BusinessException(ErrorCode.REDEEM_CODE_INVALID, '兑换码不能为空');
    const row = await this.redeemRepo.findOne({ where: { code: normalized } });
    if (!row) throw new BusinessException(ErrorCode.REDEEM_CODE_INVALID, '兑换码无效');
    if (row.status === 'revoked') throw new BusinessException(ErrorCode.REDEEM_CODE_REVOKED, '兑换码已作废');
    if (row.status === 'used') {
      if (row.usedBy === userId) return this.getStatus(userId);
      throw new BusinessException(ErrorCode.REDEEM_CODE_USED, '兑换码已被使用');
    }
    await this.grantMembership(userId, row.level, row.durationDays);
    row.status = 'used';
    row.usedBy = userId;
    row.usedAt = new Date();
    await this.redeemRepo.save(row);
    return this.getStatus(userId);
  }

  /** 开通/续期会员（未过期顺延，已过期/降级从今天起算） */
  async grantMembership(userId: number, level: MembershipLevel, durationDays: number): Promise<void> {
    const now = new Date();
    let row = await this.membershipRepo.findOne({ where: { userId } });
    if (!row) {
      row = this.membershipRepo.create({
        userId,
        level,
        status: 'active',
        startedAt: now,
        expiresAt: new Date(now.getTime() + durationDays * 86400000),
      });
    } else {
      const base = row.expiresAt && row.expiresAt.getTime() > now.getTime() ? row.expiresAt : now;
      row.level = level;
      row.status = 'active';
      row.startedAt = row.startedAt ?? now;
      row.expiresAt = new Date(base.getTime() + durationDays * 86400000);
    }
    await this.membershipRepo.save(row);
  }

  /** 批量生成兑换码 */
  async generateCodes(
    level: MembershipLevel,
    durationDays: number,
    count: number,
    batchId?: string,
  ): Promise<string[]> {
    const safeCount = Math.min(Math.max(count, 1), 1000);
    const codes: string[] = [];
    const rows = this.redeemRepo.create(
      Array.from({ length: safeCount }, () => {
        const code = generateRedeemCode();
        codes.push(code);
        return {
          code,
          level,
          durationDays,
          status: 'unused' as const,
          batchId: batchId ?? null,
        };
      }),
    );
    await this.redeemRepo.save(rows);
    return codes;
  }

  /** 作废兑换码（已使用不可作废） */
  async revokeCode(code: string): Promise<void> {
    const row = await this.redeemRepo.findOne({ where: { code: String(code ?? '').trim().toUpperCase() } });
    if (!row) throw new BusinessException(ErrorCode.REDEEM_CODE_INVALID, '兑换码不存在');
    if (row.status === 'used') throw new BusinessException(ErrorCode.REDEEM_CODE_USED, '已使用的兑换码不可作废');
    row.status = 'revoked';
    await this.redeemRepo.save(row);
  }

  /** 按批次/状态查询兑换码 */
  async listCodes(query: { batchId?: string; status?: string; limit?: number } = {}): Promise<RedeemCodeEntity[]> {
    const where: Record<string, unknown> = {};
    if (query.batchId) where.batchId = query.batchId;
    if (query.status) where.status = query.status;
    return this.redeemRepo.find({ where, order: { createdAt: 'DESC' }, take: Math.min(query.limit ?? 100, 1000) });
  }

  private view(level: MembershipLevel, status: MembershipStatus, expiresAt: Date | null, graceDaysLeft: number): MembershipStatusView {
    return { level, status, features: featuresForLevel(level), expiresAt, graceDaysLeft };
  }
}

/** 生成 16 位兑换码（去易混淆字符） */
export function generateRedeemCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
