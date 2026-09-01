import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('eco_agent_versions')
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


  @Column({ name: 'package_url', length: 1024, nullable: true })
  packageUrl?: string;

  @Column({ name: 'package_size', type: 'bigint', nullable: true })
  packageSize?: number;

  @Column({ name: 'package_hash', length: 128, nullable: true })
  packageHash?: string;

  @Column({ name: 'min_runtime_version', length: 32, nullable: true })
  minRuntimeVersion?: string;

  @Column({ name: 'required_services', type: 'json', nullable: true })
  requiredServices?: string[];
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
