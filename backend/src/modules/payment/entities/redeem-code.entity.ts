import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';
import type { MembershipLevel } from './user-membership.entity';

/** 兑换码状态 */
export type RedeemCodeStatus = 'unused' | 'used' | 'revoked';

/**
 * 兑换码表（redeem_codes）
 * 用于批量发放会员（专业版/企业版），后台批量生成，用户兑换开通。
 */
@Entity('redeem_codes')
export class RedeemCodeEntity {
  /** 兑换码（大写字母数字，主键） */
  @PrimaryColumn({ length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 16 })
  level: MembershipLevel;

  @Column({ name: 'duration_days', type: 'int' })
  durationDays: number;

  @Column({ type: 'varchar', length: 16, default: 'unused' })
  status: RedeemCodeStatus;

  @Index()
  @Column({ name: 'used_by', type: 'bigint', nullable: true, transformer: bigintTransformer })
  usedBy?: number | null;

  @Column({ name: 'used_at', type: 'datetime', nullable: true })
  usedAt?: Date | null;

  @Index()
  @Column({ name: 'batch_id', length: 64, nullable: true })
  batchId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
