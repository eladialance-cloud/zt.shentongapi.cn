import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { TeamService } from "../services/team.service";

/** 我的团队任务（含 auto/agent 模式，无团队归属任务的读取与回写走这里） */
@ApiTags("我的团队任务")
@ApiBearerAuth()
@Controller("team-tasks")
export class TeamTasksController {
  constructor(private readonly service: TeamService) {}

  @Get("mine")
  @ApiOperation({ summary: "我的全部团队任务（三种执行方式）" })
  listMine(
    @CurrentUser("userId") userId: number,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
  ) {
    return this.service.listMyTasks(
      userId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      status as any,
    );
  }

  @Patch(":taskId")
  @ApiOperation({ summary: "更新我的任务（状态/结果/执行方式）" })
  update(
    @CurrentUser("userId") userId: number,
    @Param("taskId", ParseIntPipe) taskId: number,
    @Body() body: {
      status?: "pending" | "in_progress" | "completed" | "failed";
      result?: unknown;
      executeMode?: "team" | "auto" | "agent";
      teamId?: number | null;
      agentId?: number;
    },
  ) {
    return this.service.updateMyTask(userId, taskId, body);
  }

  @Delete(":taskId")
  @ApiOperation({ summary: "删除我的任务" })
  async remove(
    @CurrentUser("userId") userId: number,
    @Param("taskId", ParseIntPipe) taskId: number,
  ) {
    await this.service.deleteMyTask(userId, taskId);
    return null;
  }
}