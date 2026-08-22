import {
  Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { CreateScheduledTaskDto, UpdateScheduledTaskDto, ScheduledTaskFiredDto } from './dto/scheduled-task.dto';

/** 定时任务 — 对话创建，桌面端软件开着时触发，经 Hermes 编排执行 */
@ApiTags('定时任务')
@ApiBearerAuth()
@Controller('scheduled-tasks')
export class ScheduledTasksController {
  constructor(private readonly service: ScheduledTasksService) {}

  @Post()
  @ApiOperation({ summary: '创建定时任务' })
  create(@CurrentUser('userId') userId: number, @Body() dto: CreateScheduledTaskDto) {
    return this.service.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '定时任务列表' })
  list(@CurrentUser('userId') userId: number) {
    return this.service.list(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '定时任务详情' })
  getOne(@CurrentUser('userId') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.service.getOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新定时任务' })
  update(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduledTaskDto,
  ) {
    return this.service.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除定时任务' })
  async remove(@CurrentUser('userId') userId: number, @Param('id', ParseIntPipe) id: number) {
    await this.service.remove(userId, id);
    return { ok: true };
  }

  @Post(':id/fire')
  @ApiOperation({ summary: '触发占位（桌面端调度器轮询到期任务时调用，10 分钟窗口防重复）' })
  fire(@CurrentUser('userId') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.service.fire(userId, id);
  }

  @Post(':id/fired')
  @ApiOperation({ summary: '触发完成回执（推进下次执行时间）' })
  fired(
    @CurrentUser('userId') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScheduledTaskFiredDto,
  ) {
    return this.service.fired(userId, id, dto);
  }
}
