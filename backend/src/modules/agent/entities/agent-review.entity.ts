import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('agent_reviews')
export class AgentReviewEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_agent_reviews_agent_id')
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  @Index('idx_agent_reviews_reviewer_id')
  @Column({ name: 'reviewer_id', type: 'bigint' })
  reviewerId: number;

  @Column({
    type: 'enum',
    enum: ['approve', 'reject'],
  })
  action: 'approve' | 'reject';

  @Column({ length: 512, nullable: true })
  reason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
