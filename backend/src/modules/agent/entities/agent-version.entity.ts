import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('agent_versions')
export class AgentVersionEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_agent_versions_agent_id')
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  @Column({ length: 32 })
  version: string;

  @Column({ name: 'system_prompt', type: 'text' })
  systemPrompt: string;

  @Column({ name: 'model_id', length: 64 })
  modelId: string;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  changelog?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
