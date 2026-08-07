import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

export type ConnectionStatus = 'untested' | 'connected' | 'failed';

export type ModelSyncStatus = 'pending' | 'synced' | 'failed';

@Entity('models')
export class ModelEntity extends BaseEntity {
  @Index()
  @Column({ length: 64 })
  provider: string;

  /** 所属供应商 ID（model_providers.id；老数据迁移后填充） */
  @Column({ name: 'provider_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  providerId?: number;

  /** 真正发送给上游 API 的模型名（默认 = modelId） */
  @Column({ name: 'upstream_model_id', length: 128, nullable: true })
  upstreamModelId?: string;

  /** 分类标签（可修改）：chat / reasoning / image / embedding 等 */
  @Column({ name: 'model_type', length: 32, default: 'chat' })
  modelType: string;

  @Index({ unique: true })
  @Column({ name: 'model_id', length: 64 })
  modelId: string;

  @Column({ length: 128 })
  name: string;

  /** API 地址 */
  @Column({ name: 'api_endpoint', length: 512, nullable: true })
  apiEndpoint?: string;

  /** AES 加密的 API Key */
  @Column({ name: 'api_key', length: 512, nullable: true })
  apiKey?: string;

  /** 连接状态 */
  @Column({
    name: 'connection_status',
    type: 'varchar',
    length: 16,
    default: 'untested',
  })
  connectionStatus: ConnectionStatus;

  /** 最后测试时间 */
  @Column({ name: 'last_tested_at', type: 'datetime', nullable: true })
  lastTestedAt?: Date;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ name: 'context_window', type: 'int', nullable: true })
  contextWindow?: number;

  @Column({ name: 'max_tokens', type: 'int', nullable: true })
  maxTokens?: number;

  @Column({ name: 'supports_vision', type: 'boolean', default: false })
  supportsVision: boolean;

  @Column({ name: 'supports_functions', type: 'boolean', default: false })
  supportsFunctions: boolean;

  @Column({ name: 'min_user_level', type: 'int', default: 0 })
  minUserLevel: number;

  @Column({
    name: 'price_per_1k_input',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  pricePer1kInput?: number;

  @Column({
    name: 'price_per_1k_output',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  pricePer1kOutput?: number;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
