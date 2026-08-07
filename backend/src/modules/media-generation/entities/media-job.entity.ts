import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

const idColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

export type MediaJobType = 'image' | 'video';
export type MediaJobStatus = 'pending' | 'processing' | 'done' | 'failed';

/** 文生图/文生视频生成任务 */
@Entity('media_jobs')
export class MediaJobEntity {
  @PrimaryGeneratedColumn(idColumnOptions)
  id: number;

  @Index('idx_media_jobs_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ name: 'session_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  sessionId?: number;

  @Column({ name: 'model_id', length: 64 })
  modelId: string;

  @Column({ type: 'varchar', length: 8 })
  type: MediaJobType;

  @Column({ type: 'mediumtext' })
  prompt: string;

  /** 生成参数：size / resolution / duration / fps / externalTaskId */
  @Column({ type: 'json', nullable: true })
  params?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: MediaJobStatus;

  /** 产物相对路径（/uploads/files/generated/xxx） */
  @Column({ name: 'result_urls', type: 'json', nullable: true })
  resultUrls?: string[] | null;

  @Column({ name: 'credits_cost', type: 'int', default: 0 })
  creditsCost: number;

  @Column({ name: 'frozen_txn_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  frozenTxnId?: number | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  error?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
