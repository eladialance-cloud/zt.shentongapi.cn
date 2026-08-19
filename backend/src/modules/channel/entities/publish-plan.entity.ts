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
