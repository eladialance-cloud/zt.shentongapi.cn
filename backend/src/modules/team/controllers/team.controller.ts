import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../common/decorators/public.decorator";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { TeamService } from "../services/team.service";

@ApiTags("团队管理")
@ApiBearerAuth()
@Controller("teams")
export class TeamController {
  constructor(private readonly service: TeamService) {}

  @Public()
  @Get("health")
  @ApiOperation({ summary: "健康检查" })
  health() {
    return this.service.health();
  }

  // ============ Teams ============

  @Get()
  @ApiOperation({ summary: "团队列表" })
  listTeams(@CurrentUser("userId") userId: number) {
    return this.service.listTeams(userId);
  }

  @Post()
  @ApiOperation({ summary: "创建团队" })
  createTeam(
    @CurrentUser("userId") userId: number,
    @Body() body: {
      name: string;
      description?: string;
      avatar?: string;
      knowledgeBaseId?: number;
      memberAgentIds?: number[];
      members?: Array<{
        agentId: number;
        agentName?: string;
        roleTitle?: string;
        roleDescription?: string;
        roleEmoji?: string;
        themeColor?: string;
      }>;
    },
  ) {
    return this.service.createTeam(userId, body);
  }

  @Get("agents")
  @ApiOperation({ summary: "可选 Agent 列表（用于选择团队成员）" })
  async listSelectableAgents() {
    return this.service.listSelectableAgents();
  }

  @Get(":teamId")
  @ApiOperation({ summary: "团队详情" })
  getTeamDetail(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
  ) {
    return this.service.getTeamDetail(userId, Number(teamId));
  }

  @Get(":teamId/workflow")
  @ApiOperation({ summary: "团队协作流程" })
  getWorkflow(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
  ) {
    return this.service.getWorkflow(userId, Number(teamId));
  }

  @Put(":teamId/workflow")
  @ApiOperation({ summary: "保存团队协作流程（整表替换）" })
  saveWorkflow(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Body() body: {
      nodes: Array<{
        name: string;
        description?: string;
        sortOrder?: number;
        assigneeMemberIds?: number[];
      }>;
    },
  ) {
    return this.service.saveWorkflow(userId, Number(teamId), body.nodes);
  }

  @Patch(":teamId")
  @ApiOperation({ summary: "更新团队信息" })
  updateTeam(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Body() body: { name?: string; description?: string; avatar?: string },
  ) {
    return this.service.updateTeam(userId, Number(teamId), body);
  }

  @Delete(":teamId")
  @ApiOperation({ summary: "删除团队" })
  async deleteTeam(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
  ) {
    await this.service.deleteTeam(userId, Number(teamId));
    return null;
  }


  // ============ Members ============

  @Get(":teamId/members")
  @ApiOperation({ summary: "团队成员列表" })
  listMembers(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
  ) {
    return this.service.listMembers(userId, Number(teamId));
  }

  @Post(":teamId/members")
  @ApiOperation({ summary: "添加团队成员（Agent + 自定义职能）" })
  addMember(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Body() body: {
      agentId: number;
      agentName?: string;
      agentAvatar?: string;
      roleTitle: string;
      roleDescription?: string;
      roleEmoji?: string;
      themeColor?: string;
      sortOrder?: number;
    },
  ) {
    return this.service.addMember(userId, Number(teamId), body);
  }

  @Patch(":teamId/members/:memberId")
  @ApiOperation({ summary: "更新成员信息（职能/颜色/排序等）" })
  updateMember(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Param("memberId") memberId: string,
    @Body() body: {
      roleTitle?: string;
      roleDescription?: string;
      roleEmoji?: string;
      themeColor?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.service.updateMember(userId, Number(teamId), Number(memberId), body);
  }

  @Delete(":teamId/members/:memberId")
  @ApiOperation({ summary: "移除团队成员" })
  async removeMember(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Param("memberId") memberId: string,
  ) {
    await this.service.removeMember(userId, Number(teamId), Number(memberId));
    return null;
  }

  // ============ Tasks ============

  @Get(":teamId/tasks")
  @ApiOperation({ summary: "团队任务列表" })
  listTasks(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
  ) {
    return this.service.listTasks(
      userId,
      Number(teamId),
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      status as any,
      priority as any,
    );
  }

  @Post(":teamId/tasks")
  @ApiOperation({ summary: "创建任务" })
  createTask(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Body() body: {
      title: string;
      description?: string;
      assigneeMemberId?: number;
      priority?: string;
      dueDate?: Date;
      executionRef?: string;
    },
  ) {
    return this.service.createTask(userId, Number(teamId), {
      title: body.title,
      description: body.description,
      assigneeMemberId: body.assigneeMemberId,
      priority: body.priority as any,
      dueDate: body.dueDate,
      executionRef: body.executionRef,
    });
  }

  @Patch(":teamId/tasks/:taskId")
  @ApiOperation({ summary: "更新任务" })
  updateTask(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateTask(userId, Number(teamId), Number(taskId), body);
  }

  @Delete(":teamId/tasks/:taskId")
  @ApiOperation({ summary: "删除任务" })
  async deleteTask(
    @CurrentUser("userId") userId: number,
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
  ) {
    await this.service.deleteTask(userId, Number(teamId), Number(taskId));
    return null;
  }
}
