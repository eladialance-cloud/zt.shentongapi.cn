import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminAuditService } from './admin-audit.service';
import { AuditQueueQueryDto } from './dto/audit-queue-query.dto';
import { RejectAuditDto } from './dto/reject-audit.dto';
import { UpdateAuditConfigDto } from './dto/update-audit-config.dto';
import { AuditTestDto } from './dto/audit-test.dto';

/**
 * 管理端内容审核控制器
 * 数据合同真源：Task 25 - 内容审核 / frontend admin-audit-api.ts
 *
 * 端点：
 *   GET    /admin/audit/queue               审核队列
 *   POST   /admin/audit/:id/approve         审核通过
 *   POST   /admin/audit/:id/reject          审核驳回
 *   POST   /admin/audit/:id/false-positive  标记误报
 *   GET    /admin/audit/config              AI 审核配置
 *   PUT    /admin/audit/config              更新 AI 审核配置
 *   POST   /admin/audit/test                AI 审核测试
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-内容审核')
@ApiBearerAuth()
@Public()
@Controller('admin/audit')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly service: AdminAuditService) {}

  @Get('queue')
  @ApiOperation({ summary: '审核队列' })
  async listQueue(@Query() query: AuditQueueQueryDto) {
    return this.service.listQueue(query);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '审核通过' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    await this.service.approve(id, req.adminUser);
    return null;
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '审核驳回' })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectAuditDto,
    @Req() req: any,
  ) {
    await this.service.reject(id, dto, req.adminUser);
    return null;
  }

  @Post(':id/false-positive')
  @ApiOperation({ summary: '标记误报' })
  async markFalsePositive(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    await this.service.markFalsePositive(id, req.adminUser);
    return null;
  }

  @Get('config')
  @ApiOperation({ summary: 'AI 审核配置' })
  async getConfig() {
    return this.service.getAuditConfig();
  }

  @Put('config')
  @ApiOperation({ summary: '更新 AI 审核配置' })
  async updateConfig(@Body() dto: UpdateAuditConfigDto) {
    await this.service.updateAuditConfig(dto);
    return null;
  }

  @Post('test')
  @ApiOperation({ summary: 'AI 审核测试' })
  async test(@Body() dto: AuditTestDto) {
    return this.service.testAudit(dto);
  }
}
