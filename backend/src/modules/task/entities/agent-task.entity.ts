import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 通用任务实体
 * 记录用户发起的各类任务（聊天、工作流、技能、多智能体）
 */
@Entity('agent_task')
export class AgentTaskEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Index()
  @Column({ name: 'agent_id', type: 'bigint', nullable: true })
  agentId?: number;

  @Column({
    name: 'task_type',
    type: 'enum',
    enum: ['chat', 'workflow', 'skill', 'multi_agent', 'codex'],
    default: 'chat',
  })
  taskType: 'chat' | 'workflow' | 'skill' | 'multi_agent' | 'codex';

  @Column({ length: 256, nullable: true })
  title?: string;

  @Column({ name: 'input_text', type: 'text', nullable: true })
  inputText?: string;

  @Column({ name: 'input_params', type: 'json', nullable: true })
  inputParams?: Record<string, unknown>;

  @Index()
  @Column({
    type: 'enum',
    enum: ['queued', 'running', 'success', 'failed', 'cancelled'],
    default: 'queued',
  })
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

  @Column({ name: 'hermes_task_id', length: 64, nullable: true })
  hermesTaskId?: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt?: Date;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs?: number;

  @Column({ name: 'credits_cost', type: 'int', default: 0 })
  creditsCost: number;

  @Column({ name: 'credits_frozen', type: 'int', default: 0 })
  creditsFrozen: number;
}
