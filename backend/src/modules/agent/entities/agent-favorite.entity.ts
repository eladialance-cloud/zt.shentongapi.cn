import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('agent_favorites')
@Index('uniq_agent_favorites_user_agent', ['userId', 'agentId'], { unique: true })
export class AgentFavoriteEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_agent_favorites_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Index('idx_agent_favorites_agent_id')
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
