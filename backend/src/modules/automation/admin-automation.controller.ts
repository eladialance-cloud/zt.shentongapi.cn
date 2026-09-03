import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "../admin-auth/admin.guard";
import { AdminAutomationService } from "./admin-automation.service";

/**
 * 管理端自动化工作台（A1 模板管理 / A2 安全策略 / A3 用户设备视图）
 * 方案文档: 深瞳AI自动化工作台建设方案（代码内置版）A1-A3
 * 路由前缀 /api/admin/automation/*，全部走 AdminGuard 鉴权
 */
@ApiTags("管理端-自动化工作台")
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller("admin/automation")
export class AdminAutomationController {
  constructor(private readonly adminAutomationService: AdminAutomationService) {}

  // ============ A1 模板管理 ============

  @Get("templates")
  @ApiOperation({ summary: "模板列表（可按下架状态过滤）" })
  listTemplates(@Query("status") status?: string) {
    return this.adminAutomationService.listTemplates(status);
  }

  @Post("templates")
  @ApiOperation({ summary: "新建模板" })
  createTemplate(@Body() body: Record<string, any>) {
    return this.adminAutomationService.createTemplate(body);
  }

  @Patch("templates/:id")
  @ApiOperation({ summary: "更新模板（含上下架）" })
  updateTemplate(@Param("id", ParseIntPipe) id: number, @Body() body: Record<string, any>) {
    return this.adminAutomationService.updateTemplate(id, body);
  }

  @Delete("templates/:id")
  @ApiOperation({ summary: "删除模板" })
  async deleteTemplate(@Param("id", ParseIntPipe) id: number) {
    await this.adminAutomationService.deleteTemplate(id);
    return null;
  }

  // ============ A2 安全策略 ============

  @Get("policies")
  @ApiOperation({ summary: "安全策略列表（高危操作/域名黑名单）" })
  listPolicies() {
    return this.adminAutomationService.listPolicies();
  }

  @Put("policies/:key")
  @ApiOperation({ summary: "更新安全策略" })
  updatePolicy(
    @Param("key") key: string,
    @Body() body: Record<string, any>,
    @Req() req: Request & { adminUser?: { id: number } },
  ) {
    return this.adminAutomationService.updatePolicy(key, {
      ...body,
      updatedBy: (req as any)?.adminUser?.id,
    });
  }

  // ============ A3 用户/设备视图 ============

  @Get("overview")
  @ApiOperation({ summary: "用户 IM 绑定/设备在线/实例统计" })
  overview() {
    return this.adminAutomationService.overview();
  }

  @Get("audit")
  @ApiOperation({ summary: "执行历史审计（按用户/关键词筛选）" })
  audit(
    @Query("userId") userId?: string,
    @Query("keyword") keyword?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.adminAutomationService.listAudit({
      userId: userId ? Number(userId) : undefined,
      keyword,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }
}