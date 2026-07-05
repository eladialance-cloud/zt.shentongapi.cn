import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('opc_team_members')
@Index('uniq_opc_team_members', ['teamId', 'userId'], { unique: true })
export class OpcTeamMemberEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_opc_team_members_team_id')
  @Column({ name: 'team_id', type: 'bigint' })
  teamId: number;

  @Index('idx_opc_team_members_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ type: 'enum', enum: ['owner', 'admin', 'member'] })
  role: 'owner' | 'admin' | 'member';

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;
}
