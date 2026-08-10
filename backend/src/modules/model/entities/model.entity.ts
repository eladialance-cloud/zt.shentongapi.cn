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

  /** 路由/计费分类（由「输出类型×输入类型」推导）：chat / vision / image / image_edit / video / tts */
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

  /** 输入类型(多选)：text 文字 / image 图片 / video 视频 / audio 语音 */
  @Column({ name: 'input_types', type: 'json', nullable: true })
  inputTypes?: string[] | null;

  /** 高级能力(多选)：function_calling / streaming / reasoning / json_mode */
  @Column({ name: 'advanced_capabilities', type: 'json', nullable: true })
  advancedCapabilities?: string[] | null;

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

    /** 图片生成固定积分（积分/张，type=image 时生效） */
  @Column({ name: 'price_per_image', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pricePerImage?: number;

  /** 视频生成价格矩阵：{ 分辨率: { 时长秒: 积分 } } */
  @Column({ name: 'video_prices', type: 'json', nullable: true })
  videoPrices?: Record<string, Record<string, number>> | null;

  /** 生成参数选项：image_sizes / video_resolutions / video_durations / video_fps */
  @Column({ name: 'generation_params', type: 'json', nullable: true })
  generationParams?: Record<string, unknown> | null;

  /** 排序权重（前端下拉顺序；同类型默认模型取最小排序值） */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** 按次计费积分（tts 等单次调用消耗点数，0 表示免费） */
  @Column({ name: 'price_per_call', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pricePerCall?: number;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
