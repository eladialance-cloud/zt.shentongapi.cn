import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "../../../common/entities/base.entity";

/** 渠道配置 — 设计文档: channel_integration_design_20260730.md */
@Entity("channels")
export class ChannelEntity extends BaseEntity {
  @Column({ length: 64 })
  name: string;

  @Column({
    type: "enum",
    enum: [
      "wechat_mp", "wechat_work", "feishu_bot",
      "dingtalk_bot", "telegram_bot",
    ],
  })
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

  @Column({ name: "last_message_at", type: "datetime", nullable: true })
  lastMessageAt?: Date;

  @Index()
  @Column({ name: "user_id", type: "bigint" })
  userId: number;
}
