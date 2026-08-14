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
  /** 按分钟计费积分（stt/tts 等，积分/分钟） */
  @Column({ name: 'price_per_minute', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pricePerMinute?: number;

  /** 调用模式（14 种字典，默认按 model_type 回填） */
  @Column({ name: 'call_mode', length: 32, default: 'text_chat' })
  callMode: string;

  /** 场景标签（固定字典多选） */
  @Column({ name: 'scenario_tags', type: 'json', nullable: true })
  scenarioTags?: string[] | null;

  /** 计费方式：token / per_image / per_call / per_minute / per_second */
  @Column({ name: 'pricing_mode', length: 16, nullable: true })
  pricingMode?: string;

  /** 视频按分辨率档积分/秒：{ "720P": 2, "1080P": 4 } */
  @Column({ name: 'video_per_second', type: 'json', nullable: true })
  videoPerSecond?: Record<string, number> | null;

  /** 动态规格字段值（按 call_mode 的 specFields 存储） */
  @Column({ type: 'json', nullable: true })
  specs?: Record<string, unknown> | null;

  /** 模型图标 URL */
  @Column({ name: 'icon_url', length: 512, nullable: true })
  iconUrl?: string;

  /** 成本价（人民币元，后台算毛利率） */
  @Column({ name: 'cost_price', type: 'decimal', precision: 10, scale: 4, nullable: true })
  costPrice?: number;

  /** 管理员备注（用户不可见） */
  @Column({ length: 512, nullable: true })
  remark?: string;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
