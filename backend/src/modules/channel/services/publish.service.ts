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
      reviewStatus: "pending",
      scheduledAt: data.scheduledAt,
      taskId: data.taskId,
      assetIds: data.assetIds,
    });
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
