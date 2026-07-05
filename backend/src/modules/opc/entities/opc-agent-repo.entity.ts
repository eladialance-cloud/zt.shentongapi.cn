import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('opc_agent_repos')
export class OpcAgentRepoEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_opc_agent_repos_team_id')
  @Column({ name: 'team_id', type: 'bigint' })
  teamId: number;

  @Index('idx_opc_agent_repos_agent_id')
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  @Column({ name: 'agent_name', length: 64 })
  agentName: string;

  @Column({ name: 'agent_avatar', length: 512, nullable: true })
  agentAvatar?: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ length: 32 })
  version: string;

  @Column({ name: 'added_by', type: 'bigint' })
  addedBy: number;

  @CreateDateColumn({ name: 'added_at' })
  addedAt: Date;
}
