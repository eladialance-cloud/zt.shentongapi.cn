import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { OpcService } from '../services/opc.service';

@ApiTags('OPC协作')
@ApiBearerAuth()
@Controller('opc')
export class OpcController {
  constructor(private readonly service: OpcService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.service.health();
  }

  // ============ Teams ============

  @Get('teams')
  @ApiOperation({ summary: 'OPC 团队列表（当前用户）' })
  listTeams(@CurrentUser() user: ICurrentUser) {
    return this.service.listTeams(user.userId);
  }

  @Post('teams')
  @ApiOperation({ summary: '创建 OPC 团队并绑定 Agent 成员' })
  createTeam(
    @CurrentUser() user: ICurrentUser,
    @Body()
    body: {
      name: string;
      description?: string;
      memberAgentIds?: number[];
    },
  ) {
    return this.service.createTeam(user.userId, body);
  }

  @Delete('teams/:id')
  @ApiOperation({ summary: '删除 OPC 团队（仅创建者）' })
  async deleteTeam(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    await this.service.deleteTeam(user.userId, Number(id));
    return null;
  }

  @Get('teams/:id')
  @ApiOperation({ summary: 'OPC 团队详情（含 workflow）' })
  getTeamDetail(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    return this.service.getTeamDetail(user.userId, Number(id));
  }

  // ============ Members ============

  @Get('teams/:id/members')
  @ApiOperation({ summary: 'OPC 团队成员（Agent）列表' })
  listMembers(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    return this.service.listMembers(user.userId, Number(id));
  }

  // ============ Tasks ============

  @Get('teams/:id/tasks')
  @ApiOperation({ summary: 'OPC 团队任务列表（分页 + 状态过滤）' })
  listTasks(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listTasks(user.userId, Number(id), {
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: '更新 OPC 任务（状态流转等）' })
  updateTask(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateTask(user.userId, Number(id), body);
  }

  // ============ Agents ============

  @Get('agents')
  @ApiOperation({ summary: '可加入 OPC 团队的 Agent 列表（已发布）' })
  listSelectableAgents() {
    return this.service.listSelectableAgents();
  }
}
