import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';
import { ModelEntity } from '../../model/entities/model.entity';

/** 模型计费/能力/场景配置（P5 从 ai_models 拆出） */
@Entity('ai_model_pricing')
export class ModelPricingEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'model_id', type: 'bigint', transformer: bigintTransformer })
  modelId: number;

  @OneToOne(() => ModelEntity, (m) => m.pricing)
  @JoinColumn({ name: 'model_id' })
  model: ModelEntity;

  /** 输入类型(多选)：text 文字 / image 图片 / video 视频 / audio 语音 */
  @Column({ name: 'input_types', type: 'json', nullable: true })
  inputTypes?: string[] | null;

  /** 高级能力(多选)：function_calling / streaming / reasoning / json_mode */
  @Column({ name: 'advanced_capabilities', type: 'json', nullable: true })
  advancedCapabilities?: string[] | null;

  @Column({ name: 'min_user_level', type: 'int', default: 0 })
  minUserLevel: number;

  @Column({ name: 'price_per_1k_input', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pricePer1kInput?: number;

  @Column({ name: 'price_per_1k_output', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pricePer1kOutput?: number;

  /** 图片生成固定积分（积分/张，type=image 时生效） */
  @Column({ name: 'price_per_image', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pricePerImage?: number;

  /** 视频生成价格矩阵：{ 分辨率: { 时长秒: 积分 } } */
  @Column({ name: 'video_prices', type: 'json', nullable: true })
  videoPrices?: Record<string, Record<string, number>> | null;

  /** 按次计费积分（tts 等单次调用消耗点数，0 表示免费） */
  @Column({ name: 'price_per_call', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pricePerCall?: number;

  /** 按分钟计费积分（stt/tts 等，积分/分钟） */
  @Column({ name: 'price_per_minute', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pricePerMinute?: number;

  /** 计费方式：token / per_image / per_call / per_minute / per_second */
  @Column({ name: 'pricing_mode', type: 'varchar', length: 16, nullable: true })
  pricingMode?: string | null;

  /** 视频按分辨率档积分/秒 */
  @Column({ name: 'video_per_second', type: 'json', nullable: true })
  videoPerSecond?: Record<string, number> | null;

  /** 场景标签（固定字典多选） */
  @Column({ name: 'scenario_tags', type: 'json', nullable: true })
  scenarioTags?: string[] | null;

  /** 生成参数选项：image_sizes / video_resolutions / video_durations / video_fps */
  @Column({ name: 'generation_params', type: 'json', nullable: true })
  generationParams?: Record<string, unknown> | null;

  /** 成本价（元） */
  @Column({ name: 'cost_price', type: 'decimal', precision: 10, scale: 4, nullable: true })
  costPrice?: number;
}
