import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('agent_call_logs')
export class AgentCallLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_agent_call_logs_agent_id')
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  @Index('idx_agent_call_logs_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Index('idx_agent_call_logs_session_id')
  @Column({ name: 'session_id', type: 'bigint' })
  sessionId: number;

  @Column({ name: 'token_usage', type: 'json', nullable: true })
  tokenUsage?: { input: number; output: number; total: number };

  @Column({ name: 'credits_cost', type: 'int', default: 0 })
  creditsCost: number;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs?: number;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ length: 512, nullable: true })
  error?: string;

  @Index('idx_agent_call_logs_created_at')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
