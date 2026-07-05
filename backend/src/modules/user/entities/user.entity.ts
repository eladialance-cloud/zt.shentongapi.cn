import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('users')
export class UserEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  username: string;

  @Index({ unique: true })
  @Column({ length: 128 })
  email: string;

  @Column({ length: 128, select: false })
  password: string;

  @Index()
  @Column({ length: 20, nullable: true })
  phone?: string;

  @Column({ length: 512, nullable: true })
  avatar?: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['active', 'banned'],
    default: 'active',
  })
  status: 'active' | 'banned';

  @Column({ name: 'real_name_verified', default: false })
  realNameVerified: boolean;

  @Column({ default: 0 })
  level: number;

  @Column({ name: 'ban_reason', length: 512, nullable: true })
  banReason?: string;

  @Column({
    name: 'ban_duration',
    type: 'enum',
    enum: ['permanent', 'temporary'],
    nullable: true,
  })
  banDuration?: 'permanent' | 'temporary';

  @Column({ name: 'ban_until', type: 'datetime', nullable: true })
  banUntil?: Date;

  @Column({
    name: 'register_source',
    type: 'enum',
    enum: ['direct', 'invite', 'promotion'],
    default: 'direct',
  })
  registerSource: 'direct' | 'invite' | 'promotion';

  @Index()
  @Column({ name: 'inviter_id', type: 'bigint', nullable: true })
  inviterId?: number;

  @Index({ unique: true })
  @Column({ name: 'invite_code', length: 32, nullable: true })
  inviteCode?: string;

  @Column({ name: 'needs_tenant_setup', default: false })
  needsTenantSetup: boolean;
}
