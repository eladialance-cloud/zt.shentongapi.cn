import { Column, Entity, Index, OneToOne } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';
import { ModelPricingEntity } from '../../admin-model/entities/model-pricing.entity';
import { ModelCredentialEntity } from '../../admin-model/entities/model-credential.entity';

export type ConnectionStatus = 'untested' | 'connected' | 'failed';

export type ModelSyncStatus = 'pending' | 'synced' | 'failed';

/**
 * 模型主表（P5 拆表后保留核心列）
 * - 计费/能力/场景字段 → ai_model_pricing（relations.pricing）
 * - 模型级连接凭据（api_key/api_endpoint） → ai_model_credentials（relations.credentials）
 * - 旧列在 ai_models 中保留一个发布周期（回滚安全），随后由 P5 收尾清理
 */
@Entity('ai_models')
export class ModelEntity extends BaseEntity {
  @Index()
  @Column({ length: 64 })
  provider: string;

  /** 所属供应商 ID（ai_model_providers.id；老数据迁移后填充） */
  @Column({ name: 'provider_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  providerId?: number;

  /** 真正发送给上游 API 的模型名（默认 = modelId） */
  @Column({ name: 'upstream_model_id', length: 128, nullable: true })
  upstreamModelId?: string;

  /** 路由/计费分类（由「输出类型×输入类型」推导）：chat / vision / image / image_edit / video / tts */
  @Column({ name: 'model_type', length: 32, default: 'chat' })
  modelType: string;

  @Index({ unique: true })
  @Column({ name: 'model_id', length: 64 })
  modelId: string;

  @Column({ length: 128 })
  name: string;

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

  /** 排序权重（前端下拉顺序；同类型默认模型取最小排序值） */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** 调用模式（14 种字典，默认按 model_type 回填） */
  @Column({ name: 'call_mode', length: 32, default: 'text_chat' })
  callMode: string;

  /** 动态规格字段值（按 call_mode 的 specFields 存储） */
  @Column({ type: 'json', nullable: true })
  specs?: Record<string, unknown> | null;

  /** 模型图标 URL */
  @Column({ name: 'icon_url', length: 512, nullable: true })
  iconUrl?: string;

  /** 管理员备注（用户不可见） */
  @Column({ length: 512, nullable: true })
  remark?: string;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** 计费/能力/场景配置（ai_model_pricing，1:1） */
  @OneToOne(() => ModelPricingEntity, (p) => p.model, {
    cascade: ['insert', 'update'],
    nullable: true,
  })
  pricing?: ModelPricingEntity | null;

  /** 模型级连接凭据（ai_model_credentials，1:1） */
  @OneToOne(() => ModelCredentialEntity, (c) => c.model, {
    cascade: ['insert', 'update'],
    nullable: true,
  })
  credentials?: ModelCredentialEntity | null;
}
