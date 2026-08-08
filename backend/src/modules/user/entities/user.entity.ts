import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** 邮件通知开关 */
export interface EmailNotificationSettings {
  /** 对话完成 */
  chatCompleted: boolean;
  /** 积分变动 */
  creditsChanged: boolean;
  /** 系统公告 */
  systemAnnouncement: boolean;
}

/** 客户端推送开关 */
export interface PushNotificationSettings {
  /** 对话回复 */
  chatReply: boolean;
  /** Agent 审核结果 */
  agentReviewResult: boolean;
  /** 充值到账 */
  rechargeArrived: boolean;
}

/** 通知设置（JSON 列存储） */
export interface NotificationSettings {
  emailNotifications: EmailNotificationSettings;
  pushNotifications: PushNotificationSettings;
}

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
    enum: ['active', 'banned', 'deleted'],
    default: 'active',
  })
  status: 'active' | 'banned' | 'deleted';

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

  @Column({
    name: 'must_change_password',
    type: 'boolean',
    default: false,
    comment: '是否需要修改密码（默认管理员账号首次登录强制改密）',
  })
  mustChangePassword: boolean;

  @Index({ unique: true })
  @Column({ name: 'llm_proxy_key', length: 64, nullable: true })
  llmProxyKey?: string;

  @Column({ name: 'notification_settings', type: 'json', nullable: true })
  notificationSettings?: NotificationSettings | null;

  /** 用户默认对话模型（OpenClaw 本地直达对话：llm-proxy 收到 openclaw 内部模型名时按此解析） */
  @Column({ name: 'default_chat_model', length: 64, nullable: true })
  defaultChatModel?: string | null;
}
