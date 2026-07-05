import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 邀请码实体
 * 数据合同真源：Task 5 - 邀请码生成与管理服务
 */
@Entity('invite_codes')
export class InviteCodeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index({ unique: true })
  @Column({ name: 'code', type: 'varchar', length: 32 })
  code: string;

  @Index()
  @Column({ name: 'inviter_id', type: 'bigint' })
  inviterId: number;

  @Column({ name: 'invitee_id', type: 'bigint', nullable: true })
  inviteeId: number | null;

  @Index()
  @Column({ name: 'status', type: 'varchar', length: 16, default: 'active' })
  status: string; // active/used/expired

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
