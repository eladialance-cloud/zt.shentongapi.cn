import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * N8N 工作流实体
 * 缓存从 N8N API 同步的工作流信息
 */
export type N8nLastExecutionStatus = 'success' | 'error' | 'running' | 'unknown';

@Entity('task_n8n_workflows')
export class N8nWorkflowEntity extends BaseEntity {
  @Index()
  @Column({ name: 'instance_id', type: 'bigint', unsigned: true })
  instanceId: number;

  @Index()
  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: number;

  @Column({ name: 'workflow_id', length: 64 })
  workflowId: string;

  @Column({ length: 128 })
  name: string;

  @Column({ type: 'boolean', default: false })
  active: boolean;

  @Column({ type: 'json', nullable: true })
  nodes?: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  connections?: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  tags?: unknown[];

  @Column({ name: 'last_executed_at', type: 'datetime', nullable: true })
  lastExecutedAt?: Date;

  @Column({
    name: 'last_execution_status',
    length: 32,
    default: 'unknown',
  })
  lastExecutionStatus: N8nLastExecutionStatus;
}
