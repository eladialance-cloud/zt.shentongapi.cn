import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type ProviderStatus = 'active' | 'disabled';
export type ProviderConnectionStatus = 'untested' | 'connected' | 'failed';

/** 大模型第三方 API 供应商 */
@Entity('model_providers')
export class ModelProviderEntity extends BaseEntity {
  @Column({ length: 64 })
  name: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  slug: string;

  @Column({ name: 'base_url', length: 512 })
  baseUrl: string;

  /** AES 加密的 API Key（调用第三方 API 的真实凭据） */
  @Column({ name: 'api_key', length: 1024, nullable: true })
  apiKey?: string;

  /** 配置文件: headers / timeoutMs / retries / extraBody / modelsPath */
  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: ProviderStatus;

  @Column({ name: 'connection_status', type: 'varchar', length: 16, default: 'untested' })
  connectionStatus: ProviderConnectionStatus;

  @Column({ name: 'last_tested_at', type: 'datetime', nullable: true })
  lastTestedAt?: Date;

  /** 是否全局中转（全站仅 1 条 = 1 生效，唯一索引约束） */
  @Index({ unique: true })
  @Column({ name: 'is_global', type: 'tinyint', default: 0 })
  isGlobal: boolean;

  @Column({ name: 'is_builtin', type: 'boolean', default: false })
  isBuiltin: boolean;

  /** API 风格：openai_compatible / dashscope_native / anthropic / custom */
  @Column({ name: 'api_style', length: 32, nullable: true })
  apiStyle?: string;

  @Column({ name: 'rate_limit_per_minute', type: 'int', nullable: true })
  rateLimitPerMinute?: number;

  @Column({ name: 'concurrency_limit', type: 'int', nullable: true })
  concurrencyLimit?: number;

  /** 余额监控：余额接口与阈值 */
  @Column({ name: 'balance_url', length: 512, nullable: true })
  balanceUrl?: string;

  @Column({ name: 'balance_headers', type: 'json', nullable: true })
  balanceHeaders?: Record<string, unknown> | null;

  @Column({ name: 'balance_extra', type: 'json', nullable: true })
  balanceExtra?: Record<string, unknown> | null;

  @Column({ name: 'last_balance', type: 'decimal', precision: 12, scale: 2, nullable: true })
  lastBalance?: number;

  @Column({ name: 'balance_checked_at', type: 'datetime', nullable: true })
  balanceCheckedAt?: Date;

  @Column({ name: 'balance_alert_threshold', type: 'decimal', precision: 12, scale: 2, nullable: true })
  balanceAlertThreshold?: number;

  @Column({ name: 'model_count', type: 'int', default: 0 })
  modelCount: number;
}