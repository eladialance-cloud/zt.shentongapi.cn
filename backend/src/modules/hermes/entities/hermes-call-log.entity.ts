import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

/**
 * Hermes 任务历史日志
 * 记录每次编排任务的调用类型、状态、耗时和积分消耗
 */
@Entity('hermes_call_logs')
export class HermesCallLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_hermes_call_logs_instance_id')
  @Column({ name: 'instance_id', type: 'bigint', transformer: bigintTransformer, nullable: true })
  instanceId?: number | null;

  @Index('idx_hermes_call_logs_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Index('idx_hermes_call_logs_team_id')
  @Column({ name: 'team_id', type: 'bigint', transformer: bigintTransformer, nullable: true })
  teamId?: number;

  @Column({
    name: 'call_type',
    type: 'enum',
    enum: ['skill_execute', 'tool_call', 'agent_invoke', 'workflow_run', 'orchestrate'],
  })
  callType: 'skill_execute' | 'tool_call' | 'agent_invoke' | 'workflow_run' | 'orchestrate';

  @Column({
    type: 'enum',
    enum: ['success', 'failed', 'timeout', 'running'],
    default: 'running',
  })
  status: 'success' | 'failed' | 'timeout' | 'running';

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs: number;

  @Column({ name: 'credits_cost', type: 'int', default: 0 })
  creditsCost: number;

  @Column({ length: 128, nullable: true })
  target?: string;

  @Column({ name: 'error_message', length: 512, nullable: true })
  errorMessage?: string;

  @Index('idx_hermes_call_logs_created_at')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
