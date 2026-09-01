import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

// PrimaryGeneratedColumnNumericOptions 类型不含 transformer 字段（同 base.entity.ts 的处理方式）
const jobIdColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/** 口播工坊任务状态 */
export type OralWorkshopJobStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';

/**
 * 口播工坊任务表（create_oral_workshop_jobs）
 * 7 步流水线：extract → rewrite → voiceClone → digitalHuman → videoEdit → titleCover → publishReady
 */
@Entity('create_oral_workshop_jobs')
export class OralWorkshopJobEntity {
  @PrimaryGeneratedColumn(jobIdColumnOptions)
  id: number;

  @Index('idx_owj_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  /** 幂等键：重复提交同一 clientTxnId 直接返回已有任务 */
  @Column({ name: 'client_txn_id', type: 'varchar', length: 64, nullable: true, unique: true })
  clientTxnId?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: OralWorkshopJobStatus;

  /** 执行模式：auto=自动流水线（默认）/ manual=手动逐步（每步确认）/ single=单步执行 */
  @Column({ name: 'execution_mode', type: 'varchar', length: 16, default: 'auto' })
  executionMode: 'auto' | 'manual' | 'single';

  /** 手动/单步模式下等待用户放行的步骤（null=已放行或自动模式） */
  @Column({ name: 'waiting_step', type: 'varchar', length: 32, nullable: true })
  waitingStep?: string | null;

  /** 当前执行到哪一步（step 名） */
  @Column({ name: 'current_step', type: 'varchar', length: 32, nullable: true })
  currentStep?: string | null;

  /** 原始文案/选题 */
  @Column({ name: 'script_input', type: 'text', nullable: true })
  scriptInput?: string | null;

  /** 改写后文案 */
  @Column({ name: 'rewritten_script', type: 'text', nullable: true })
  rewrittenScript?: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  persona?: string | null;

  /** 口播风格（B4：人设多维度字段落库） */
  @Column({ type: 'varchar', length: 512, nullable: true })
  style?: string | null;

  /** 目标受众 */
  @Column({ name: 'target_audience', type: 'varchar', length: 255, nullable: true })
  targetAudience?: string | null;

  /** 创作目标（涨粉/带货/科普…） */
  @Column({ type: 'varchar', length: 2000, nullable: true })
  goal?: string | null;

  /** 语速（0.5-1.5，用户级，默认 0.9） */
  @Column({ name: 'voice_speech_rate', type: 'decimal', precision: 4, scale: 2, nullable: true })
  voiceSpeechRate?: string | null;

  /** 人声音量增益（-20~20） */
  @Column({ name: 'voice_loudness_rate', type: 'decimal', precision: 5, scale: 2, nullable: true })
  voiceLoudnessRate?: string | null;

  /** 情感（高兴/愤怒/悲伤/害怕/平静/无） */
  @Column({ name: 'voice_emotion', type: 'varchar', length: 16, nullable: true })
  voiceEmotion?: string | null;

  /** BGM（E3：后台音乐库条目或用户选择 URL） */
  @Column({ name: 'bgm_url', type: 'varchar', length: 512, nullable: true })
  bgmUrl?: string | null;

  /** BGM 音量（0-1，默认 0.2） */
  @Column({ name: 'bgm_volume', type: 'decimal', precision: 3, scale: 2, nullable: true })
  bgmVolume?: string | null;

  /** 画中画素材（P3 D4/E6：JSON 数组 [{url, position, scale, startSec?, endSec?}]） */
  @Column({ name: 'pip_assets', type: 'text', nullable: true })
  pipAssets?: string | null;

  /** 删除时间（F3：软删除任务） */
  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt?: Date | null;

  @Column({ name: 'digital_human_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  digitalHumanId?: number | null;

  @Column({ name: 'voice_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  voiceId?: number | null;

  /** 配音音质档位：V1=标准 / V2=高清（用户任务级选择，对应后台 voiceModelV1/voiceModelV2） */
  @Column({ name: 'voice_model_version', type: 'varchar', length: 8, nullable: true })
  voiceModelVersion?: 'V1' | 'V2' | null;
  /** 任务级官方音色（seed-tts-2.0 音色池选择，覆盖档位默认音色） */
  @Column({ name: 'voice_speaker_id', type: 'varchar', length: 128, nullable: true })
  voiceSpeakerId?: string | null;

  /** 数字人清晰度档位：V1=标准 / V2=高清（用户任务级选择，留空=后台默认） */
  @Column({ name: 'dh_model_version', type: 'varchar', length: 8, nullable: true })
  dhModelVersion?: 'V1' | 'V2' | null;

  /** 数字人生成方式（D6）：auto=自动降级（默认）/ cloud=强制云端火山 / local=强制本地卡片视频 */
  @Column({ name: 'dh_generation_mode', type: 'varchar', length: 8, default: 'auto' })
  dhGenerationMode: 'auto' | 'cloud' | 'local';

  /** 多镜头拼接（D3：JSON 数组 [{digitalHumanId, seconds}]，列表从上到下即拼接顺序） */
  @Column({ type: 'text', nullable: true })
  shots?: string | null;

  @Column({ name: 'template_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  templateId?: number | null;

  @Column({ name: 'video_url', type: 'varchar', length: 512, nullable: true })
  videoUrl?: string | null;

  @Column({ name: 'audio_url', type: 'varchar', length: 512, nullable: true })
  audioUrl?: string | null;

  @Column({ name: 'cover_url', type: 'varchar', length: 512, nullable: true })
  coverUrl?: string | null;

    /** 封面主标题（封面设计器 / AI 生成） */
  @Column({ name: 'cover_h1', type: 'varchar', length: 64, nullable: true })
  coverH1?: string | null;

  /** 封面副标题 */
  @Column({ name: 'cover_h2', type: 'varchar', length: 64, nullable: true })
  coverH2?: string | null;

  /** 封面设计配置（模板/背景/字体/颜色，JSON 字符串） */
  @Column({ name: 'cover_config', type: 'text', nullable: true })
  coverConfig?: string | null;
/** 关联 channel.create_publish_plans（导出发布包后回填） */
  @Column({ name: 'publish_plan_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  publishPlanId?: number | null;

  /** 实际结算 Credits 成本 */
  @Column({ name: 'credits_cost', type: 'int', default: 0 })
  creditsCost: number;

  /** 双语字幕开关（true = videoEdit 渲染中英双行字幕，LLM 翻译） */
  @Column({ type: 'boolean', default: false })
  bilingual: boolean;

  /** 字幕轨开关（E7：false = 成片不烧录字幕） */
  @Column({ name: 'subtitles_enabled', type: 'boolean', default: true })
  subtitlesEnabled: boolean;
  /** E4：字幕文本覆盖（多行文本，每行一条字幕；留空=自动分段） */
  @Column({ name: 'subtitles_override', type: 'text', nullable: true })
  subtitlesOverride?: string | null;

  /** BGM 轨开关（E7：false = 即使配置了 BGM 也不混入） */
  @Column({ name: 'bgm_enabled', type: 'boolean', default: true })
  bgmEnabled: boolean;

  /** 字幕目标语言（空/zh=纯中文；en/ja/vi 等=双语对照字幕；zh-HK/zh-WU 等=方言双语） */
  @Column({ name: 'target_lang', type: 'varchar', length: 16, nullable: true })
  targetLang?: string | null;

  /** 预扣流水 id（CreditsBillingService.estimateAndFreeze 返回） */
  @Column({ name: 'frozen_txn_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  frozenTxnId?: number | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  error?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
