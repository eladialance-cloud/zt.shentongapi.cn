import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "../../../common/entities/base.entity";

/** 发布计划 */
@Entity("publish_plans")
export class PublishPlanEntity extends BaseEntity {
  @Column({ length: 128 })
  title: string;

  @Column({ type: "text", nullable: true })
  content?: string;

  @Column({ name: "media_urls", type: "json", nullable: true })
  mediaUrls?: string[];

  /** 目标平台: douyin/xiaohongshu/weibo/zhihu/bilibili/wechat_mp */
  @Column({ name: "target_platforms", type: "json" })
  targetPlatforms: string[];

  @Column({
    type: "enum",
    enum: ["manual", "scheduled", "auto"],
    default: "manual",
  })
  mode: "manual" | "scheduled" | "auto";

  @Column({
    type: "enum",
    enum: ["draft", "pending_review", "approved", "rejected", "published", "failed"],
    default: "draft",
  })
  status: "draft" | "pending_review" | "approved" | "rejected" | "published" | "failed";

  /** 发布状态跟踪（F5：unpublish/publishing/success/failed/partial） */
  @Column({ name: "publish_status", type: "varchar", length: 16, default: "unpublish" })
  publishStatus: "unpublish" | "draft" | "publishing" | "success" | "failed" | "partial";

  /** 发布账号（F4a：publish_accounts.id，发布到该平台账号） */
  @Column({ name: "account_id", type: "bigint", nullable: true })
  accountId?: number | null;

  /** 批量发布账号（P4：publish_accounts.id 数组，多选批量发布） */
  @Column({ name: "account_ids", type: "json", nullable: true })
  accountIds?: number[] | null;

  @Column({ name: "review_status", type: "enum",
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  })
  reviewStatus: "pending" | "approved" | "rejected";

  @Column({ name: "review_comment", length: 512, nullable: true })
  reviewComment?: string;

  @Column({ name: "publish_result", type: "json", nullable: true })
  publishResult?: Record<string, unknown>;

  @Column({ name: "scheduled_at", type: "datetime", nullable: true })
  scheduledAt?: Date;

  @Column({ name: "published_at", type: "datetime", nullable: true })
  publishedAt?: Date;

  @Index()
  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "task_id", type: "bigint", nullable: true })
  taskId?: number;

  @Column({ name: "asset_ids", type: "json", nullable: true })
  assetIds?: number[];
}
