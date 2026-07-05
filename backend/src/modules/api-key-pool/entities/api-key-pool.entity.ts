import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type ApiKeyStatus = 'active' | 'exhausted' | 'error' | 'disabled';

/**
 * API Key 池实体
 * 数据合同真源：Task 32 - 数据安全设计
 * apiKey 字段以 AES-256-GCM 加密存储
 */
@Entity('api_key_pool')
export class ApiKeyPoolEntity extends BaseEntity {
  @Index()
  @Column({ name: 'model_config_id', type: 'bigint', nullable: true })
  modelConfigId?: number;

  @Index()
  @Column({ length: 32 })
  provider: string;

  /** AES-256-GCM 加密后的密钥 */
  @Column({ name: 'api_key', length: 512 })
  apiKey: string;

  @Column({ length: 64, nullable: true })
  alias?: string;

  /** 优先级：越小越优先 */
  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'active',
  })
  status: ApiKeyStatus;

  @Column({ name: 'total_quota', type: 'decimal', precision: 12, scale: 4 })
  totalQuota: number;

  @Column({ name: 'used_quota', type: 'decimal', precision: 12, scale: 4, default: 0 })
  usedQuota: number;

  @Column({ name: 'remaining_quota', type: 'decimal', precision: 12, scale: 4 })
  remainingQuota: number;

  @Column({ name: 'daily_quota', type: 'decimal', precision: 12, scale: 4, nullable: true })
  dailyQuota?: number;

  @Column({ name: 'monthly_quota', type: 'decimal', precision: 12, scale: 4, nullable: true })
  monthlyQuota?: number;

  @Column({ name: 'daily_used_quota', type: 'decimal', precision: 12, scale: 4, default: 0 })
  dailyUsedQuota: number;

  @Column({ name: 'monthly_used_quota', type: 'decimal', precision: 12, scale: 4, default: 0 })
  monthlyUsedQuota: number;

  @Column({ name: 'last_used_at', type: 'datetime', nullable: true })
  lastUsedAt?: Date;

  @Column({ name: 'last_check_at', type: 'datetime', nullable: true })
  lastCheckAt?: Date;

  @Column({ name: 'error_count', type: 'int', default: 0 })
  errorCount: number;
}
