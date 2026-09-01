import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PublishPlanEntity } from "../entities/publish-plan.entity";

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    @InjectRepository(PublishPlanEntity)
    private readonly planRepo: Repository<PublishPlanEntity>,
  ) {}

  async listPlans(userId: number, status?: string): Promise<PublishPlanEntity[]> {
    const where: any = { userId };
    if (status) where.status = status;
    return this.planRepo.find({ where, order: { createdAt: "DESC" } });
  }

  async getPlan(userId: number, planId: number): Promise<PublishPlanEntity> {
    const plan = await this.planRepo.findOne({ where: { id: planId, userId } });
    if (!plan) throw new NotFoundException("发布计划不存在");
    return plan;
  }

  async createPlan(
    userId: number,
    data: {
      title: string;
      content?: string;
      mediaUrls?: string[];
      targetPlatforms: string[];
      mode?: "manual" | "scheduled" | "auto";
      scheduledAt?: Date;
      taskId?: number;
      assetIds?: number[];
    },
  ): Promise<PublishPlanEntity> {
    const plan = this.planRepo.create({
      userId,
      title: data.title,
      content: data.content,
      mediaUrls: data.mediaUrls,
      targetPlatforms: data.targetPlatforms,
      mode: data.mode || "manual",
      status: "draft",
      publishStatus: "unpublish",
      reviewStatus: "pending",
      scheduledAt: data.scheduledAt,
      taskId: data.taskId,
      assetIds: data.assetIds,
    });
    return this.planRepo.save(plan);
  }

  /** F4a：设置发布账号（create_publish_accounts.id） */
  async setAccount(userId: number, planId: number, accountId: number): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    plan.accountId = accountId;
    return this.planRepo.save(plan);
  }

  /** P4：批量设置发布账号（多选批量发布；兼容单账号） */
  async setAccounts(userId: number, planId: number, accountIds: number[]): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    plan.accountIds = accountIds && accountIds.length ? accountIds : null;
    plan.accountId = accountIds && accountIds[0] ? accountIds[0] : null;
    return this.planRepo.save(plan);
  }

  /** P4：保存为草稿（发布面板可选；草稿可在详情页一键正式发布） */
  async saveAsDraft(userId: number, planId: number): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    plan.status = "draft";
    plan.publishStatus = "draft";
    plan.publishResult = { summary: "已保存为草稿（未发布，可稍后一键发布）" };
    return this.planRepo.save(plan);
  }

  /** G5：创建发布任务（手动发布：桌面端打开平台发布页完成；草稿走 saveAsDraft） */
  async publishDirect(userId: number, planId: number): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    const accountIds =
      plan.accountIds && plan.accountIds.length
        ? plan.accountIds
        : plan.accountId
          ? [plan.accountId]
          : [];
    if (accountIds.length === 0) throw new Error("未绑定发布账号");
    plan.status = "published";
    plan.publishStatus = "publishing";
    plan.publishResult = {
      summary: "发布任务已创建，等待桌面端完成平台发布",
      accountIds,
      platforms: plan.targetPlatforms.reduce((acc, p) => {
        acc[p] = { status: "publishing" };
        return acc;
      }, {} as Record<string, unknown>),
    };
    return this.planRepo.save(plan);
  }

  /** G5：仅标记发布中（手动/自动模式，桌面端驱动后回调结果） */
  async markPublishing(userId: number, planId: number): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    const accountIds =
      plan.accountIds && plan.accountIds.length
        ? plan.accountIds
        : plan.accountId
          ? [plan.accountId]
          : [];
    if (accountIds.length === 0) throw new Error("未绑定发布账号");
    plan.status = "published";
    plan.publishStatus = "publishing";
    plan.publishResult = {
      summary: "发布任务已创建，等待桌面端完成平台发布",
      accountIds,
      platforms: plan.targetPlatforms.reduce((acc, p) => {
        acc[p] = { status: "publishing" };
        return acc;
      }, {} as Record<string, unknown>),
    };
    return this.planRepo.save(plan);
  }

  /** G5：发布结果回写（桌面端完成手动/自动发布后调用；success/failed/partial） */
  async markPublished(
    userId: number,
    planId: number,
    publishStatus: "success" | "failed" | "partial",
    summary: string,
    results: Array<{ accountId: number; platform: string; status: "success" | "failed"; message?: string }>,
  ): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    plan.publishStatus = publishStatus;
    if (publishStatus === "success") plan.publishedAt = new Date();
    plan.publishResult = {
      summary,
      results,
      platforms: results.reduce((acc, r) => {
        acc[r.platform] = { accountId: r.accountId, success: r.status === "success", status: r.status, message: r.message ?? null };
        return acc;
      }, {} as Record<string, unknown>),
    };
    return this.planRepo.save(plan);
  }

  async updatePlan(
    userId: number,
    planId: number,
    data: {
      title?: string;
      content?: string;
      mediaUrls?: string[];
      targetPlatforms?: string[];
      mode?: "manual" | "scheduled" | "auto";
      scheduledAt?: Date;
      taskId?: number;
      assetIds?: number[];
    },
  ): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    if (plan.status === "published") throw new Error("已发布的计划不可修改");
    if (data.title !== undefined) plan.title = data.title;
    if (data.content !== undefined) plan.content = data.content;
    if (data.mediaUrls !== undefined) plan.mediaUrls = data.mediaUrls;
    if (data.targetPlatforms !== undefined) plan.targetPlatforms = data.targetPlatforms;
    if (data.mode !== undefined) plan.mode = data.mode;
    if (data.scheduledAt !== undefined) plan.scheduledAt = data.scheduledAt;
    if (data.taskId !== undefined) plan.taskId = data.taskId;
    if (data.assetIds !== undefined) plan.assetIds = data.assetIds;
    return this.planRepo.save(plan);
  }

  async submitForReview(userId: number, planId: number): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    if (plan.status !== "draft") throw new Error("只有草稿状态的计划可提交审核");
    plan.status = "pending_review";
    plan.reviewStatus = "pending";
    return this.planRepo.save(plan);
  }

  async reviewPlan(
    planId: number,
    data: { approved: boolean; comment?: string },
  ): Promise<PublishPlanEntity> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException("发布计划不存在");

    plan.reviewStatus = data.approved ? "approved" : "rejected";
    plan.reviewComment = data.comment;
    plan.status = data.approved ? "approved" : "rejected";
    return this.planRepo.save(plan);
  }

  async executePublish(
    userId: number,
    planId: number,
  ): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    if (plan.status !== "approved") throw new Error("只有审核通过的计划可执行发布");

    // TODO: 实际调用各平台 Adapter 的 publishContent 方法
    this.logger.log(`执行发布计划: ${plan.title}, 目标平台: ${plan.targetPlatforms.join(", ")}`);

    plan.status = "published";
    plan.publishStatus = "success";
    plan.publishedAt = new Date();
    plan.publishResult = {
      summary: `已发布到 ${plan.targetPlatforms.length} 个平台`,
      platforms: plan.targetPlatforms.reduce((acc, p) => {
        acc[p] = { success: true, status: "simulated" };
        return acc;
      }, {} as Record<string, unknown>),
    };

    return this.planRepo.save(plan);
  }

  async cancelPlan(userId: number, planId: number): Promise<PublishPlanEntity> {
    const plan = await this.getPlan(userId, planId);
    plan.status = "draft";
    return this.planRepo.save(plan);
  }
}
