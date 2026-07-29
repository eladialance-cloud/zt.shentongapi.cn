import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OpcService } from '../services/opc.service';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { PaginationQuery } from '../../../common/types/pagination.type';

// ============ DTOs ============

class CreateTeamDto {
  name: string;
  description?: string;
  memberAgentIds?: number[];
}

class UpdateTaskDto {
  status?: string;
  title?: string;
  description?: string;
}

class TaskQueryDto implements PaginationQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}

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

  // ============ 团队 ============

  @Get('teams')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '当前用户的团队列表' })
  async listTeams(@CurrentUser() user: ICurrentUser) {
    return this.service.listTeams(user.userId);
  }

  @Post('teams')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '创建团队' })
  async createTeam(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateTeamDto,
  ) {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('团队名称不能为空');
    }
    return this.service.createTeam(user.userId, dto);
  }

  @Delete('teams/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除团队' })
  async deleteTeam(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    const teamId = Number(id);
    if (isNaN(teamId)) throw new BadRequestException('无效的团队 ID');
    await this.service.deleteTeam(user.userId, teamId);
    return { success: true };
  }

  @Get('teams/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '团队详情' })
  async getTeamDetail(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    const teamId = Number(id);
    if (isNaN(teamId)) throw new BadRequestException('无效的团队 ID');
    return this.service.getTeamDetail(user.userId, teamId);
  }

  @Get('teams/:id/members')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '成员列表' })
  async listMembers(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    const teamId = Number(id);
    if (isNaN(teamId)) throw new BadRequestException('无效的团队 ID');
    return this.service.listMembers(user.userId, teamId);
  }

  @Get('teams/:id/tasks')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '任务列表（分页）' })
  async listTasks(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Query() query: TaskQueryDto,
  ) {
    const teamId = Number(id);
    if (isNaN(teamId)) throw new BadRequestException('无效的团队 ID');
    return this.service.listTasks(user.userId, teamId, query);
  }

  // ============ 任务 ============

  @Patch('tasks/:taskId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '更新任务' })
  async updateTask(
    @CurrentUser() user: ICurrentUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const tid = Number(taskId);
    if (isNaN(tid)) throw new BadRequestException('无效的任务 ID');
    return this.service.updateTask(user.userId, tid, dto);
  }

  // ============ Agent ============

  @Get('agents')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '可选 Agent 列表' })
  async listAgents() {
    return this.service.listAgents();
  }
}
