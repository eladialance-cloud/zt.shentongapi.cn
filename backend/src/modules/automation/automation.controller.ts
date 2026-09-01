import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AutomationService } from "./automation.service";

/**
 * 自动化工作台 - 场景模板/实例/审计 API（方案 B4/B6）
 */
@ApiTags("自动化工作台")
@ApiBearerAuth()
@Controller("automation")
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get("health")
  @ApiOperation({ summary: "健康检查" })
  health() {
    return this.automationService.health();
  }

  // ============ 模板 ============

  @Get("templates")
  @ApiOperation({ summary: "场景模板列表" })
  listTemplates() {
    return this.automationService.listTemplates();
  }

  // ============ 实例 ============

  @Post("instances")
  @ApiOperation({ summary: "创建场景实例（选模板填参数）" })
  createInstance(
    @CurrentUser("userId") userId: number,
    @Body() body: { templateId: number; name?: string; params?: Record<string, unknown>; deviceId?: string },
  ) {
    return this.automationService.createInstance(userId, body);
  }

  @Get("instances")
  @ApiOperation({ summary: "我的场景实例列表" })
  listInstances(@CurrentUser("userId") userId: number) {
    return this.automationService.listInstances(userId);
  }

  @Get("instances/:id")
  @ApiOperation({ summary: "场景实例详情" })
  getInstance(@CurrentUser("userId") userId: number, @Param("id") id: string) {
    return this.automationService.getInstance(userId, Number(id));
  }

  @Patch("instances/:id")
  @ApiOperation({ summary: "更新场景实例（名称/参数/启停/设备）" })
  updateInstance(
    @CurrentUser("userId") userId: number,
    @Param("id") id: string,
    @Body() body: Partial<{ name: string; params: Record<string, unknown>; enabled: number | boolean; deviceId: string | null }>,
  ) {
    return this.automationService.updateInstance(userId, Number(id), body);
  }

  @Delete("instances/:id")
  @ApiOperation({ summary: "删除场景实例" })
  async deleteInstance(@CurrentUser("userId") userId: number, @Param("id") id: string) {
    await this.automationService.deleteInstance(userId, Number(id));
    return null;
  }

  // ============ 审计 ============

  @Get("audit")
  @ApiOperation({ summary: "我的自动化执行历史（审计）" })
  listAudit(@CurrentUser("userId") userId: number, @Query("limit") limit?: string) {
    return this.automationService.listAuditLogs(userId, limit ? Number(limit) : 100);
  }
}