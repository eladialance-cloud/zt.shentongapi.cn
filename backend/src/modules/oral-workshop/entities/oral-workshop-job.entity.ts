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
 * 口播工坊任务表（oral_workshop_jobs）
 * 7 步流水线：extract → rewrite → voiceClone → digitalHuman → videoEdit → titleCover → publishReady
 */
@Entity('oral_workshop_jobs')
export class OralWorkshopJobEntity {
  @PrimaryGeneratedColumn(jobIdColumnOptions)
  id: number;

  @Index('idx_owj_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  /** 幂等键：重复提交同一 clientTxnId 直接返回已有任务 */
  @Column({ name: 'client_txn_id', length: 64, nullable: true, unique: true })
  clientTxnId?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: OralWorkshopJobStatus;

  /** 当前执行到哪一步（step 名） */
  @Column({ name: 'current_step', length: 32, nullable: true })
  currentStep?: string | null;

  /** 原始文案/选题 */
  @Column({ name: 'script_input', type: 'text', nullable: true })
  scriptInput?: string | null;

  /** 改写后文案 */
  @Column({ name: 'rewritten_script', type: 'text', nullable: true })
  rewrittenScript?: string | null;

  @Column({ length: 512, nullable: true })
  persona?: string | null;

  @Column({ name: 'digital_human_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  digitalHumanId?: number | null;

  @Column({ name: 'voice_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  voiceId?: number | null;

  @Column({ name: 'template_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  templateId?: number | null;

  @Column({ name: 'video_url', length: 512, nullable: true })
  videoUrl?: string | null;

  @Column({ name: 'audio_url', length: 512, nullable: true })
  audioUrl?: string | null;

  @Column({ name: 'cover_url', length: 512, nullable: true })
  coverUrl?: string | null;

  /** 关联 channel.publish_plans（导出发布包后回填） */
  @Column({ name: 'publish_plan_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  publishPlanId?: number | null;

  /** 实际结算 Credits 成本 */
  @Column({ name: 'credits_cost', type: 'int', default: 0 })
  creditsCost: number;

  /** 双语字幕开关（true = videoEdit 渲染中英双行字幕，LLM 翻译） */
  @Column({ type: 'boolean', default: false })
  bilingual: boolean;

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
