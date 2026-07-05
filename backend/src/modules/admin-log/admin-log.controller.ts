import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminLogService } from './admin-log.service';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 管理端操作日志控制器
 * 数据合同真源：Task 17 - 管理端认证与权限
 *
 * 端点：
 *   GET /admin/operation-logs  操作日志查询（分页）
 */
@ApiTags('管理端-操作日志')
@ApiBearerAuth()
@Public()
@Controller('admin/operation-logs')
@UseGuards(AdminGuard)
export class AdminLogController {
  constructor(private readonly service: AdminLogService) {}

  @Get()
  @ApiOperation({ summary: '操作日志查询' })
  async list(@Query() query: OperationLogQueryDto) {
    return this.service.list(query);
  }
}
