import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('agent_ratings')
@Index('uniq_agent_ratings_user_agent', ['userId', 'agentId'], { unique: true })
export class AgentRatingEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_agent_ratings_agent_id')
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  @Index('idx_agent_ratings_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  review?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
