import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index,
} from "typeorm";

/** 渠道消息记录 */
@Entity("channel_messages")
export class ChannelMessageEntity {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: number;

  @Index()
  @Column({ name: "channel_id", type: "bigint" })
  channelId: number;

  @Column({
    type: "enum",
    enum: ["inbound", "outbound"],
  })
  direction: "inbound" | "outbound";

  @Column({ name: "external_id", length: 128, nullable: true })
  externalId?: string;

  @Column({ name: "sender_external_id", length: 128, nullable: true })
  senderExternalId?: string;

  @Column({ name: "sender_name", length: 64, nullable: true })
  senderName?: string;

  @Column({ name: "content", type: "text", nullable: true })
  content?: string;

  @Column({
    type: "enum",
    enum: ["text", "image", "voice", "video", "file", "event"],
    default: "text",
  })
  messageType: string;

  @Column({ name: "raw_payload", type: "json", nullable: true })
  rawPayload?: unknown;

  @Column({ name: "reply_content", type: "text", nullable: true })
  replyContent?: string;

  @Column({
    type: "enum",
    enum: ["pending", "processing", "replied", "failed", "ignored"],
    default: "pending",
  })
  status: "pending" | "processing" | "replied" | "failed" | "ignored";

  @Column({ name: "session_id", type: "bigint", nullable: true })
  sessionId?: number;

  @Column({ name: "error_message", length: 512, nullable: true })
  errorMessage?: string;

  @Column({ name: "processed_at", type: "datetime", nullable: true })
  processedAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
