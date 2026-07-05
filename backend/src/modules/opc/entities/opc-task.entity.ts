import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('opc_tasks')
export class OpcTaskEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_opc_tasks_team_id')
  @Column({ name: 'team_id', type: 'bigint' })
  teamId: number;

  @Column({ length: 128 })
  title: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending',
  })
  status: 'pending' | 'in_progress' | 'completed';

  @Column({ name: 'assignee_id', type: 'bigint', nullable: true })
  assigneeId?: number;

  @Column({ name: 'creator_id', type: 'bigint' })
  creatorId: number;

  @Column({
    type: 'enum',
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  })
  priority: 'low' | 'medium' | 'high';

  @Column({ name: 'due_date', type: 'datetime', nullable: true })
  dueDate?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
