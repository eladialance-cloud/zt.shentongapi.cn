import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TaskService } from '../services/task.service';
import {
  CreateTaskDto,
  TaskQueryDto,
} from '../dto/task.dto';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { Pagination } from '../../../common/decorators/pagination.decorator';

/**
 * 用户端任务控制器
 * 提供任务的创建、查询、取消及输出项获取
 */
@ApiTags('任务管理')
@ApiBearerAuth()
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @ApiOperation({ summary: '获取任务列表' })
  async list(
    @CurrentUser() user: ICurrentUser,
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
    return this.taskService.listTasks(user.userId, mergedQuery);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取任务详情' })
  async detail(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.taskService.getTask(user.userId, id);
  }

  @Post()
  @ApiOperation({ summary: '创建任务' })
  async create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskService.createTask(user.userId, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消任务' })
  async cancel(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.taskService.cancelTask(user.userId, id);
  }

  @Get(':id/outputs')
  @ApiOperation({ summary: '获取任务输出项' })
  async outputs(
    @CurrentUser() user: ICurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    // 先校验任务归属
    await this.taskService.getTask(user.userId, id);
    return this.taskService.getOutputItems(id);
  }
}
