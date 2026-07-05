import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 积分配置实体（通用 key-value）
 * 数据合同真源：Task 29 - 积分数据流完整链路
 * 用途：奖励规则、充值套餐映射、消耗倍率等可配置项
 */
@Entity('credits_config')
export class CreditsConfigEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'config_key', length: 64 })
  configKey: string;

  @Column({ name: 'config_value', type: 'json' })
  configValue: Record<string, unknown>;

  @Column({ length: 256, nullable: true })
  description?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
