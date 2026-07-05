import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('team_members')
@Index('uniq_team_members', ['teamId', 'userId'], { unique: true })
export class TeamMemberEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_team_members_team_id')
  @Column({ name: 'team_id', type: 'bigint' })
  teamId: number;

  @Index('idx_team_members_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ type: 'enum', enum: ['admin', 'member', 'viewer'] })
  role: 'admin' | 'member' | 'viewer';

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;
}
