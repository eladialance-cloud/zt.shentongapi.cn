import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_roles')
@Index('uniq_user_roles', ['userId', 'roleId'], { unique: true })
export class UserRoleEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_user_roles_user_id')
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Index('idx_user_roles_role_id')
  @Column({ name: 'role_id', type: 'bigint' })
  roleId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
