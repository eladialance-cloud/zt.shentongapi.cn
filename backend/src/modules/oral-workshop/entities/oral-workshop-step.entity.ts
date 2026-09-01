import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

// PrimaryGeneratedColumnNumericOptions 类型不含 transformer 字段（同 base.entity.ts 的处理方式）
const stepIdColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/** 口播工坊步骤状态 */
export type OralWorkshopStepStatus = 'pending' | 'running' | 'done' | 'failed';

/** 口播工坊步骤明细表（create_oral_workshop_steps） */
@Entity('create_oral_workshop_steps')
export class OralWorkshopStepEntity {
  @PrimaryGeneratedColumn(stepIdColumnOptions)
  id: number;

  @Index('idx_ows_job_id')
  @Column({ name: 'job_id', type: 'bigint', transformer: bigintTransformer })
  jobId: number;

  /** 步骤名：extract/rewrite/voiceClone/digitalHuman/videoEdit/titleCover/publishReady */
  @Column({ length: 32 })
  step: string;

  /** 执行顺序（1 起） */
  @Column({ name: 'step_order', type: 'int' })
  stepOrder: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: OralWorkshopStepStatus;

  /** 每步产物（JSON） */
  @Column({ name: 'result_json', type: 'json', nullable: true })
  resultJson?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  error?: string | null;

  /** 重试次数（上限 2，见 pipeline.maxStepRetries） */
  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt?: Date | null;
}
