import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/**
 * Hermes 实例实体
 * 每个实例对应一个 Hermes 编排进程，管理技能包挂载和任务分发
 */
@Entity('create_hermes_instances')
export class HermesInstanceEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ length: 64 })
  name: string;

  @Column({
    type: 'enum',
    enum: ['running', 'stopped', 'error'],
    default: 'stopped',
  })
  status: 'running' | 'stopped' | 'error';

  @Column({ name: 'pid', type: 'int', nullable: true })
  pid?: number;

  @Column({ name: 'skill_count', type: 'int', default: 0 })
  skillCount: number;

  @Column({ name: 'skill_ids', type: 'json', nullable: true })
  skillIds?: number[];

  @Column({ name: 'execution_type', type: 'varchar', length: 16, nullable: true })
  executionType?: 'team' | 'workflow';

  @Column({ name: 'team_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  teamId?: number;

  @Column({ name: 'workflow_id', type: 'varchar', length: 64, nullable: true })
  workflowId?: string;

  @Column({ name: 'knowledge_base_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  knowledgeBaseId?: number;


  @Column({ name: 'error_message', length: 512, nullable: true })
  errorMessage?: string;

  @Column({ name: 'cpu_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  cpuPercent: number;

  @Column({ name: 'memory_used_mb', type: 'int', default: 0 })
  memoryUsedMb: number;

  @Column({ name: 'memory_total_mb', type: 'int', default: 0 })
  memoryTotalMb: number;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date;
}
