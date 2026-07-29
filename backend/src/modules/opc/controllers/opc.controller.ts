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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { OpcService } from '../services/opc.service';

@ApiTags('OPC鍗忎綔')
@ApiBearerAuth()
@Controller('opc')
export class OpcController {
  constructor(private readonly service: OpcService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: '鍋ュ悍妫€鏌? })
  health() {
    return this.service.health();
  }

  // ============ Teams ============

  @Get('teams')
  @ApiOperation({ summary: '鍥㈤槦鍒楄〃' })
  listTeams(
    @CurrentUser('userId') userId: number,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listTeams(
      userId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Post('teams')
  @ApiOperation({ summary: '鍒涘缓鍥㈤槦' })
  createTeam(
    @CurrentUser('userId') userId: number,
    @Body() body: { name: string; description?: string; avatar?: string },
  ) {
    return this.service.createTeam(userId, body);
  }

  @Get('teams/:teamId')
  @ApiOperation({ summary: '鍥㈤槦璇︽儏' })
  getTeamDetail(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
  ) {
    return this.service.getTeamDetail(userId, Number(teamId));
  }

  @Patch('teams/:teamId')
  @ApiOperation({ summary: '鏇存柊鍥㈤槦' })
  updateTeam(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Body() body: { name?: string; description?: string; avatar?: string },
  ) {
    return this.service.updateTeam(userId, Number(teamId), body);
  }

  @Delete('teams/:teamId')
  @ApiOperation({ summary: '鍒犻櫎鍥㈤槦' })
  async deleteTeam(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
  ) {
    await this.service.deleteTeam(userId, Number(teamId));
    return null;
  }

  // ============ Members ============

  @Get('teams/:teamId/members')
  @ApiOperation({ summary: '鍥㈤槦鎴愬憳鍒楄〃' })
  listMembers(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
  ) {
    return this.service.listMembers(userId, Number(teamId));
  }

  @Post('teams/:teamId/members')
  @ApiOperation({ summary: '娣诲姞鍥㈤槦鎴愬憳' })
  addMember(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Body() body: { userId: number; role: 'admin' | 'member' },
  ) {
    return this.service.addMember(
      userId,
      Number(teamId),
      Number(body.userId),
      body.role,
    );
  }

  @Delete('teams/:teamId/members/:userId')
  @ApiOperation({ summary: '绉婚櫎鍥㈤槦鎴愬憳' })
  async removeMember(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Param('userId') targetUserId: string,
  ) {
    await this.service.removeMember(
      userId,
      Number(teamId),
      Number(targetUserId),
    );
    return null;
  }

  @Patch('teams/:teamId/members/:userId')
  @ApiOperation({ summary: '鏇存柊鎴愬憳瑙掕壊' })
  updateMemberRole(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Param('userId') targetUserId: string,
    @Body() body: { role: 'admin' | 'member' },
  ) {
    return this.service.updateMemberRole(
      userId,
      Number(teamId),
      Number(targetUserId),
      body.role,
    );
  }

  // ============ Tasks ============

  @Get('teams/:teamId/tasks')
  @ApiOperation({ summary: '鍥㈤槦浠诲姟鍒楄〃' })
  listTasks(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: 'pending' | 'in_progress' | 'completed',
    @Query('priority') priority?: 'low' | 'medium' | 'high',
  ) {
    return this.service.listTasks(
      userId,
      Number(teamId),
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      status,
      priority,
    );
  }

  @Post('teams/:teamId/tasks')
  @ApiOperation({ summary: '鍒涘缓浠诲姟' })
  createTask(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Body()
    body: {
      title: string;
      description?: string;
      assigneeId?: number;
      priority?: 'low' | 'medium' | 'high';
      dueDate?: Date;
    },
  ) {
    return this.service.createTask(userId, Number(teamId), {
      title: body.title,
      description: body.description,
      assigneeId: body.assigneeId,
      priority: body.priority,
      dueDate: body.dueDate,
    });
  }

  @Get('teams/:teamId/tasks/:taskId')
  @ApiOperation({ summary: '浠诲姟璇︽儏' })
  getTask(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.service.getTask(userId, Number(teamId), Number(taskId));
  }

  @Patch('teams/:teamId/tasks/:taskId')
  @ApiOperation({ summary: '鏇存柊浠诲姟' })
  updateTask(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Body()
    body: Partial<{
      title: string;
      description: string;
      assigneeId: number;
      priority: 'low' | 'medium' | 'high';
      dueDate: Date;
      status: 'pending' | 'in_progress' | 'completed';
    }>,
  ) {
    return this.service.updateTask(userId, Number(teamId), Number(taskId), body);
  }

  @Delete('teams/:teamId/tasks/:taskId')
  @ApiOperation({ summary: '鍒犻櫎浠诲姟' })
  async deleteTask(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
  ) {
    await this.service.deleteTask(userId, Number(teamId), Number(taskId));
    return null;
  }

  // ============ Agent Repos ============

  @Get('teams/:teamId/agents')
  @ApiOperation({ summary: '鍥㈤槦 Agent 鍒楄〃' })
  listTeamAgents(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
  ) {
    return this.service.listTeamAgents(userId, Number(teamId));
  }

  @Post('teams/:teamId/agents')
  @ApiOperation({ summary: '娣诲姞鍥㈤槦 Agent' })
  addTeamAgent(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Body() body: { agentId: number },
  ) {
    return this.service.addTeamAgent(
      userId,
      Number(teamId),
      Number(body.agentId),
    );
  }

  @Delete('teams/:teamId/agents/:agentId')
  @ApiOperation({ summary: '绉婚櫎鍥㈤槦 Agent' })
  async removeTeamAgent(
    @CurrentUser('userId') userId: number,
    @Param('teamId') teamId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.service.removeTeamAgent(
      userId,
      Number(teamId),
      Number(agentId),
    );
    return null;
  }
}
