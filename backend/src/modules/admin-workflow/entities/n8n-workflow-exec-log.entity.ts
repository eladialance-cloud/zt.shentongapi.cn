import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 工作流执行日志实体
 */
@Entity('task_n8n_workflow_exec_log')
export class N8nWorkflowExecLogEntity extends BaseEntity {
  /** 用户 ID */
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  /** 工作流库 ID */
  @Index()
  @Column({ name: 'workflow_lib_id', type: 'bigint', nullable: true })
  workflowLibId?: number;

  /** N8N 实例 ID */
  @Column({ name: 'n8n_instance_id', type: 'bigint', nullable: true })
  n8nInstanceId?: number;

  /** N8N 执行 ID */
  @Column({ name: 'n8n_execution_id', length: 64, nullable: true })
  n8nExecutionId?: string;

  /** 关联任务 ID（task_agent_tasks.id） */
  @Index()
  @Column({ name: 'task_id', type: 'bigint', nullable: true })
  taskId?: number;

  /** 执行状态 */
  @Index()
  @Column({
    type: 'enum',
    enum: ['queued', 'running', 'success', 'failed', 'cancelled'],
    default: 'queued',
  })
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

  /** 输入数据 */
  @Column({ name: 'input_data', type: 'json', nullable: true })
  inputData?: Record<string, unknown>;

  /** 输出数据 */
  @Column({ name: 'output_data', type: 'json', nullable: true })
  outputData?: Record<string, unknown>;

  /** 错误信息 */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  /** 开始时间 */
  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date;

  /** 完成时间 */
  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt?: Date;

  /** 执行时长（毫秒） */
  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs?: number;
}
