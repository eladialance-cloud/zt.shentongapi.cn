import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

// PrimaryGeneratedColumnNumericOptions 类型不含 transformer 字段（同 base.entity.ts 的处理方式）
const userMembershipIdColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/** 会员等级：free（免费）/ pro（专业）/ enterprise（企业） */
export type MembershipLevel = 'free' | 'pro' | 'enterprise';
/** 会员状态 */
export type MembershipStatus = 'active' | 'expired' | 'cancelled';

/**
 * 用户会员表（user_memberships）
 * 每用户唯一一行；免费用户也可落行（level=free），未落行视为 free。
 */
@Entity('user_memberships')
export class UserMembershipEntity {
  @PrimaryGeneratedColumn(userMembershipIdColumnOptions)
  id: number;

  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ type: 'varchar', length: 16, default: 'free' })
  level: MembershipLevel;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: MembershipStatus;

  /** 个性化 features（覆盖 level 默认特性，可为空走 featuresForLevel） */
  @Column({ name: 'features_json', type: 'json', nullable: true })
  featuresJson?: Record<string, unknown> | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
