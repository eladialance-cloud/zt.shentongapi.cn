import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

const paIdColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/**
 * 发布账号（对标 aigc-human platform_accounts）
 * 绑定方式：桌面端扫码登录 → cookies 加密上传 → login_status=online
 * 管理后台只控制平台开关（oral_workshop_publish_platforms）
 */
@Entity('publish_accounts')
export class PublishAccountEntity {
  @PrimaryGeneratedColumn(paIdColumnOptions)
  id: number;

  @Index('idx_pa_user')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  /** 平台：douyin / kuaishou / xiaohongshu / bilibili / xigua / wx_channels */
  @Column({ length: 32 })
  platform: string;

  /** 账号名称（用户起名，对标 account_name） */
  @Column({ name: 'account_name', length: 128 })
  accountName: string;

  /** 平台显示名称（登录后回填，对标 display_name） */
  @Column({ name: 'display_name', type: 'varchar', length: 128, nullable: true })
  displayName?: string | null;

  /** 头像 URL（可选） */
  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true })
  avatarUrl?: string | null;

  /** 平台登录态 cookie（AES-256-GCM 加密后落库，桌面端扫码采集） */
  @Column({ type: 'text', nullable: true })
  cookies?: string | null;

  /** 授权状态：pending=待授权 / active=已绑定 / failed=失败 */
  @Column({ length: 16, default: 'pending' })
  status: 'pending' | 'active' | 'failed';

  /** 登录态：online=登录有效 / expired=已过期 / offline=未登录 */
  @Column({ name: 'login_status', length: 16, default: 'offline' })
  loginStatus: 'online' | 'expired' | 'offline';

  /** 绑定时间 */
  @Column({ name: 'bound_at', type: 'datetime', nullable: true })
  boundAt?: Date | null;

  /** 最后登录时间（对标 last_login_at） */
  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt?: Date | null;

  /** 备注 */
  @Column({ type: 'varchar', length: 255, nullable: true })
  remark?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
