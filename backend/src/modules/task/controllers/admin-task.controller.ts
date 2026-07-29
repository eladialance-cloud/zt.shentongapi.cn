import {
  Controller,
  Get,
  Delete,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TaskService } from '../services/task.service';
import { TaskQueryDto } from '../dto/task.dto';
import { AdminGuard } from '../../admin-auth/admin.guard';
import { Public } from '../../../common/decorators/public.decorator';
import { Pagination } from '../../../common/decorators/pagination.decorator';

/**
 * 管理端任务控制器
 * 提供全部任务查看、详情、删除等功能
 */
@ApiTags('管理端-任务管理')
@UseGuards(AdminGuard)
@Public()
@ApiBearerAuth()
@Controller('admin/tasks')
export class AdminTaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @ApiOperation({ summary: '获取全部任务列表' })
  async list(
    @Pagination()
    pagination: { page: number; pageSize: number; keyword?: string },
    @Query('taskType') taskType?: string,
    @Query('status') status?: string,
  ) {
    const mergedQuery: TaskQueryDto = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: pagination.keyword,
      taskType: taskType as any,
      status: status as any,
    };
    return this.taskService.listAllTasks(mergedQuery);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取任务详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.taskService.getTaskById(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除任务' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.taskService.deleteTask(id);
    return { success: true };
  }
}
