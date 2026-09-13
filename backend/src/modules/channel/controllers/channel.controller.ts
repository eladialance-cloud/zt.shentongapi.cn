import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../common/decorators/public.decorator";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { ChannelService } from "../services/channel.service";
import { PublishService } from "../services/publish.service";
import { CHANNEL_PLATFORMS } from "../channel-platforms";

@ApiTags("渠道管理")
@ApiBearerAuth()
@Controller("channels")
export class ChannelController {
  constructor(
    private readonly channelService: ChannelService,
    private readonly publishService: PublishService,
  ) {}

  @Public()
  @Get("health")
  @ApiOperation({ summary: "健康检查" })
  health() {
    return this.channelService.health();
  }

  @Public()
  @Get("platforms")
  @ApiOperation({ summary: "可选渠道平台（含连接方式/是否支持入站回调）" })
  listPlatforms() {
    return CHANNEL_PLATFORMS;
  }

  // ============ 渠道 CRUD ============

  @Get()
  @ApiOperation({ summary: "渠道列表" })
  listChannels(@CurrentUser("userId") userId: number) {
    return this.channelService.listChannels(userId);
  }

  @Post()
  @ApiOperation({ summary: "创建渠道" })
  createChannel(
    @CurrentUser("userId") userId: number,
    @Body() body: {
      name: string;
      platform: string;
      direction: "input" | "output" | "both";
      credentials?: Record<string, string>;
      webhookUrl?: string;
      webhookToken?: string;
      teamId?: number;
      agentId?: number;
      agentRef?: string;
      accountId?: string;
    },
  ) {
    return this.channelService.createChannel(userId, body);
  }

  @Get(":channelId")
  @ApiOperation({ summary: "渠道详情" })
  getChannel(
    @CurrentUser("userId") userId: number,
    @Param("channelId") channelId: string,
  ) {
    return this.channelService.getChannel(userId, Number(channelId));
  }

  @Patch(":channelId")
  @ApiOperation({ summary: "更新渠道" })
  updateChannel(
    @CurrentUser("userId") userId: number,
    @Param("channelId") channelId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.channelService.updateChannel(userId, Number(channelId), body);
  }

  @Post(":channelId/test")
  @ApiOperation({ summary: "测试渠道连接（静态校验 + 适配器 healthCheck）" })
  testChannelConnection(
    @CurrentUser("userId") userId: number,
    @Param("channelId") channelId: string,
  ) {
    return this.channelService.testConnection(userId, Number(channelId));
  }

  @Delete(":channelId")
  @ApiOperation({ summary: "删除渠道" })
  async deleteChannel(
    @CurrentUser("userId") userId: number,
    @Param("channelId") channelId: string,
  ) {
    await this.channelService.deleteChannel(userId, Number(channelId));
    return null;
  }


  // ============ 发布计划 ============

  @Get("publish/plans")
  @ApiOperation({ summary: "发布计划列表" })
  listPublishPlans(
    @CurrentUser("userId") userId: number,
    @Query("status") status?: string,
  ) {
    return this.publishService.listPlans(userId, status);
  }

  @Post("publish/plans")
  @ApiOperation({ summary: "创建发布计划" })
  createPublishPlan(
    @CurrentUser("userId") userId: number,
    @Body() body: {
      title: string;
      content?: string;
      mediaUrls?: string[];
      targetPlatforms: string[];
      mode?: "manual" | "scheduled" | "auto";
      scheduledAt?: Date;
      taskId?: number;
      assetIds?: number[];
    },
  ) {
    return this.publishService.createPlan(userId, body);
  }

  @Patch("publish/plans/:planId")
  @ApiOperation({ summary: "更新发布计划（草稿/待审核可改）" })
  updatePublishPlan(
    @CurrentUser("userId") userId: number,
    @Param("planId") planId: string,
    @Body() body: {
      title?: string;
      content?: string;
      mediaUrls?: string[];
      targetPlatforms?: string[];
      mode?: "manual" | "scheduled" | "auto";
      scheduledAt?: Date;
      taskId?: number;
      assetIds?: number[];
    },
  ) {
    return this.publishService.updatePlan(userId, Number(planId), body);
  }

  @Get("publish/plans/:planId")
  @ApiOperation({ summary: "发布计划详情" })
  getPublishPlan(
    @CurrentUser("userId") userId: number,
    @Param("planId") planId: string,
  ) {
    return this.publishService.getPlan(userId, Number(planId));
  }

  @Post("publish/plans/:planId/submit")
  @ApiOperation({ summary: "提交审核" })
  submitForReview(
    @CurrentUser("userId") userId: number,
    @Param("planId") planId: string,
  ) {
    return this.publishService.submitForReview(userId, Number(planId));
  }

  @Post("publish/plans/:planId/review")
  @ApiOperation({ summary: "审核发布计划" })
  reviewPlan(
    @Param("planId") planId: string,
    @Body() body: { approved: boolean; comment?: string },
  ) {
    return this.publishService.reviewPlan(Number(planId), body);
  }

  @Post("publish/plans/:planId/execute")
  @ApiOperation({ summary: "执行发布" })
  executePublish(
    @CurrentUser("userId") userId: number,
    @Param("planId") planId: string,
  ) {
    return this.publishService.executePublish(userId, Number(planId));
  }

  @Post("publish/plans/:planId/cancel")
  @ApiOperation({ summary: "取消发布（退回草稿）" })
  cancelPublish(
    @CurrentUser("userId") userId: number,
    @Param("planId") planId: string,
  ) {
    return this.publishService.cancelPlan(userId, Number(planId));
  }
}
