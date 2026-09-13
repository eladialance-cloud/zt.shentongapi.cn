import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "../../../common/entities/base.entity";

/** 渠道配置（P2 拆分：独立 create_publish_channels 表，channels 归 community 社区频道） — 设计文档: channel_integration_design_20260730.md */
@Entity("create_publish_channels")
export class ChannelEntity extends BaseEntity {
  @Column({ length: 64 })
  name: string;

  /** 平台标识：取值受 channel-platforms.ts 约束（后端为 VARCHAR，新增平台不需要改表枚举） */
  @Column({ length: 32 })
  platform: string;

  @Column({
    type: "enum",
    enum: ["input", "output", "both"],
    default: "input",
  })
  direction: "input" | "output" | "both";

  @Column({
    type: "enum",
    enum: ["active", "disabled", "error"],
    default: "active",
  })
  status: "active" | "disabled" | "error";

  /** 加密存储的平台凭证 */
  @Column({ name: "credentials", type: "text", nullable: true })
  credentials?: string;

  @Column({ name: "webhook_url", length: 512, nullable: true })
  webhookUrl?: string;

  @Column({ name: "webhook_token", length: 256, nullable: true })
  webhookToken?: string;

  /** 绑定的团队 ID（可选） */
  @Index()
  @Column({ name: "team_id", type: "bigint", nullable: true })
  teamId?: number;

  /** 绑定的 Agent ID（可选，单 Agent 处理） */
  @Index()
  @Column({ name: "agent_id", type: "bigint", nullable: true })
  agentId?: number;

  /** 绑定的官署/角色 id（可选，如 bingbu/libu；对标 RRClaw 渠道账号绑定 AI 员工） */
  @Column({ name: "agent_ref", length: 64, nullable: true })
  agentRef?: string;

  /** 账号标识（同一平台多账号：默认 default；清洗为小写字母数字-下划线） */
  @Index()
  @Column({ name: "account_id", length: 64, nullable: true })
  accountId?: string;

  @Column({ name: "last_message_at", type: "datetime", nullable: true })
  lastMessageAt?: Date;

  @Index()
  @Column({ name: "user_id", type: "bigint" })
  userId: number;
}
