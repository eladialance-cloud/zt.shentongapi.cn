import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository, In } from "typeorm";
import { TeamEntity } from "../entities/team.entity";
import { TeamMemberEntity } from "../entities/team-member.entity";
import { TeamTaskEntity } from "../entities/team-task.entity";
import { TeamWorkflowNodeEntity } from "../entities/team-workflow-node.entity";
import { BusinessException } from "../../../common/exceptions/business.exception";
import { ErrorCode } from "../../../common/constants/error.constant";

type TeamTaskStatus = "pending" | "in_progress" | "completed" | "failed";
type TeamTaskPriority = "low" | "medium" | "high" | "urgent";

export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly memberRepo: Repository<TeamMemberEntity>,
    @InjectRepository(TeamTaskEntity)
    private readonly taskRepo: Repository<TeamTaskEntity>,
    @InjectRepository(TeamWorkflowNodeEntity)
    private readonly workflowRepo: Repository<TeamWorkflowNodeEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  health() {
    return { status: "ok", module: "team" };
  }

  // ============ Teams ============

  async listTeams(userId: number): Promise<TeamEntity[]> {
    // 只返回当前用户创建的团队（与模块内 create/update/delete 的 creatorId 权限一致）
    return this.teamRepo.find({
      where: { creatorId: userId },
      order: { createdAt: "DESC" },
    });
  }

  async createTeam(
    userId: number,
    data: {
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
  ): Promise<TeamEntity> {
    return this.dataSource.transaction(async (manager) => {
      const teamRepo = manager.getRepository(TeamEntity);
      const memberRepo = manager.getRepository(TeamMemberEntity);

      const memberCount = data.members?.length ?? data.memberAgentIds?.length ?? 0;
      const team = teamRepo.create({
        name: data.name,
        avatar: data.avatar,
        description: data.description,
        knowledgeBaseId: data.knowledgeBaseId,
        memberCount,
        creatorId: userId,
      });
      const saved = await teamRepo.save(team);

      if (data.members && data.members.length > 0) {
        const members = data.members.map((m, index) =>
          memberRepo.create({
            teamId: saved.id,
            agentId: m.agentId,
            agentName: m.agentName || `Agent #${m.agentId}`,
            roleTitle: m.roleTitle || "团队成员",
            roleDescription: m.roleDescription,
            roleEmoji: m.roleEmoji,
            themeColor: m.themeColor,
            sortOrder: index,
            isActive: true,
            addedBy: userId,
          }),
        );
        await memberRepo.save(members);
      } else if (data.memberAgentIds && data.memberAgentIds.length > 0) {
        const members = data.memberAgentIds.map((agentId, index) =>
          memberRepo.create({
            teamId: saved.id,
            agentId,
            agentName: `Agent #${agentId}`,
            roleTitle: "团队成员",
            sortOrder: index,
            isActive: true,
            addedBy: userId,
          }),
        );
        await memberRepo.save(members);
      }

      return saved;
    });
  }

  async getTeamDetail(
    userId: number,
    teamId: number,
  ): Promise<{ team: TeamEntity; workflow: TeamWorkflowNodeEntity[] }> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "团队不存在");
    }
    const workflow = await this.workflowRepo.find({
      where: { teamId },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return { team, workflow };
  }

  /** 读取团队协作流程（升序） */
  async getWorkflow(
    userId: number,
    teamId: number,
  ): Promise<TeamWorkflowNodeEntity[]> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "团队不存在");
    }
    if (Number(team.creatorId) !== userId) {
      const isMember = await this.memberRepo.findOne({ where: { teamId, agentId: userId } });
      if (!isMember) {
        BusinessException.throw(ErrorCode.FORBIDDEN, "无权查看该团队");
      }
    }
    return this.workflowRepo.find({
      where: { teamId },
      order: { sortOrder: "ASC", id: "ASC" },
    });
  }

  /** 保存团队协作流程（整表替换；nodes 为空 = 清空，走默认流程） */
  async saveWorkflow(
    userId: number,
    teamId: number,
    nodes: Array<{
      name: string;
      description?: string;
      sortOrder?: number;
      assigneeMemberIds?: number[];
    }>,
  ): Promise<TeamWorkflowNodeEntity[]> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "团队不存在");
    }
    // 安全加固：仅创建者或成员可修改协作流程
    if (Number(team.creatorId) !== userId) {
      const isMember = await this.memberRepo.findOne({ where: { teamId, agentId: userId } });
      if (!isMember) {
        BusinessException.throw(ErrorCode.FORBIDDEN, "仅团队创建者或成员可修改协作流程");
      }
    }
    const list = Array.isArray(nodes) ? nodes : [];
    if (list.length > 20) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, "协作流程节点最多 20 个");
    }
    const cleaned = list
      .map((n, index) => ({
        name: String(n?.name ?? "").trim().slice(0, 128),
        description: n?.description ? String(n.description).trim().slice(0, 512) : undefined,
        sortOrder: Number.isFinite(n?.sortOrder) ? Number(n.sortOrder) : index,
        assigneeMemberIds: Array.isArray(n?.assigneeMemberIds) ? n.assigneeMemberIds : [],
      }))
      .filter((n) => n.name.length > 0);
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(TeamWorkflowNodeEntity, { teamId });
      if (cleaned.length > 0) {
        await manager.save(
          cleaned.map((n) =>
            manager.create(TeamWorkflowNodeEntity, {
              teamId,
              name: n.name,
              description: n.description,
              sortOrder: n.sortOrder,
              assigneeMemberIds: n.assigneeMemberIds,
            }),
          ),
        );
      }
    });
    return this.workflowRepo.find({
      where: { teamId },
      order: { sortOrder: "ASC", id: "ASC" },
    });
  }

  async updateTeam(
    userId: number,
    teamId: number,
    data: { name?: string; description?: string; avatar?: string },
  ): Promise<TeamEntity> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "团队不存在");
    }
    // 安全加固 P1-1: 仅创建者可修改团队
    if (Number(team.creatorId) !== userId) {
      BusinessException.throw(ErrorCode.FORBIDDEN, "仅团队创建者可修改团队信息");
    }
    if (data.name !== undefined) team.name = data.name;
    if (data.description !== undefined) team.description = data.description;
    if (data.avatar !== undefined) team.avatar = data.avatar;
    return this.teamRepo.save(team);
  }

  async deleteTeam(userId: number, teamId: number): Promise<void> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "团队不存在");
    }
    // 安全加固 P1-1: 仅创建者可删除团队
    if (Number(team.creatorId) !== userId) {
      BusinessException.throw(ErrorCode.FORBIDDEN, "仅团队创建者可删除团队");
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(TeamMemberEntity, { teamId });
      await manager.delete(TeamTaskEntity, { teamId });
      await manager.delete(TeamWorkflowNodeEntity, { teamId });
      await manager.delete(TeamEntity, { id: teamId });
    });
  }

  // ============ Members (Agent-based) ============

  async listMembers(
    userId: number,
    teamId: number,
  ): Promise<TeamMemberEntity[]> {
    return this.memberRepo.find({
      where: { teamId },
      order: { sortOrder: "ASC", joinedAt: "ASC" },
    });
  }

  async addMember(
    userId: number,
    teamId: number,
    data: {
      agentId: number;
      agentName?: string;
      agentAvatar?: string;
      roleTitle: string;
      roleDescription?: string;
      roleEmoji?: string;
      themeColor?: string;
      sortOrder?: number;
    },
  ): Promise<TeamMemberEntity> {
    // 安全加固 P1-1: 验证操作者是创建者或已有成员
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) BusinessException.throw(ErrorCode.NOT_FOUND, "团队不存在");
    if (Number(team.creatorId) !== userId) {
      const isMember = await this.memberRepo.findOne({ where: { teamId, agentId: userId } });
      if (!isMember) BusinessException.throw(ErrorCode.FORBIDDEN, "无权添加成员");
    }
    const existing = await this.memberRepo.findOne({
      where: { teamId, agentId: data.agentId },
    });
    if (existing) {
      BusinessException.throw(ErrorCode.USER_EXISTS, "该 Agent 已是团队成员");
    }

    const member = this.memberRepo.create({
      teamId,
      agentId: data.agentId,
      agentName: data.agentName || `Agent #${data.agentId}`,
      agentAvatar: data.agentAvatar,
      roleTitle: data.roleTitle,
      roleDescription: data.roleDescription,
      roleEmoji: data.roleEmoji,
      themeColor: data.themeColor,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
      addedBy: userId,
    });
    const saved = await this.memberRepo.save(member);

    // Update member count
    await this.teamRepo.increment({ id: teamId }, "memberCount", 1);

    return saved;
  }

  async updateMember(
    userId: number,
    teamId: number,
    memberId: number,
    data: {
      roleTitle?: string;
      roleDescription?: string;
      roleEmoji?: string;
      themeColor?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<TeamMemberEntity> {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, teamId },
    });
    if (!member) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "成员不存在");
    }

    if (data.roleTitle !== undefined) member.roleTitle = data.roleTitle;
    if (data.roleDescription !== undefined) member.roleDescription = data.roleDescription;
    if (data.roleEmoji !== undefined) member.roleEmoji = data.roleEmoji;
    if (data.themeColor !== undefined) member.themeColor = data.themeColor;
    if (data.sortOrder !== undefined) member.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) member.isActive = data.isActive;

    return this.memberRepo.save(member);
  }

  async removeMember(
    userId: number,
    teamId: number,
    memberId: number,
  ): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, teamId },
    });
    if (!member) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "成员不存在");
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(TeamMemberEntity, { id: memberId });
      // Unassign tasks assigned to this member
      await manager.update(
        TeamTaskEntity,
        { teamId, assigneeMemberId: memberId },
        { assigneeMemberId: undefined as any },
      );
    });

    await this.teamRepo.decrement({ id: teamId }, "memberCount", 1);
  }

  // ============ Tasks ============

  async listTasks(
    userId: number,
    teamId: number,
    page = 1,
    pageSize = 20,
    status?: TeamTaskStatus,
    priority?: TeamTaskPriority,
  ): Promise<Paginated<TeamTaskEntity>> {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));

    const where: any = { teamId };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [list, total] = await this.taskRepo.findAndCount({
      where,
      skip: (p - 1) * ps,
      take: ps,
      order: { createdAt: "DESC" },
    });

    return { list, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
  }

  async createTask(
    userId: number,
    teamId: number,
    data: {
      title: string;
      description?: string;
      assigneeMemberId?: number;
      priority?: TeamTaskPriority;
      dueDate?: Date;
      executionRef?: string;
    },
  ): Promise<TeamTaskEntity> {
    const task = this.taskRepo.create({
      teamId,
      title: data.title,
      description: data.description,
      status: "pending",
      assigneeMemberId: data.assigneeMemberId,
      creatorId: userId,
      priority: data.priority ?? "medium",
      dueDate: data.dueDate,
      executionRef: data.executionRef,
    });
    return this.taskRepo.save(task);
  }

  async updateTask(
    userId: number,
    teamId: number,
    taskId: number,
    data: Partial<{
      title: string;
      description: string;
      assigneeMemberId: number;
      priority: TeamTaskPriority;
      dueDate: Date;
      status: TeamTaskStatus;
      result: unknown;
      teamId?: number;
    }>,
  ): Promise<TeamTaskEntity> {
    // 归属校验：仅团队创建者可修改团队任务（防跨团队越权读写）
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "团队不存在");
    }
    if (Number(team.creatorId) !== userId) {
      BusinessException.throw(ErrorCode.FORBIDDEN, "仅团队创建者可修改任务");
    }
    const task = await this.taskRepo.findOne({ where: { id: taskId, teamId } });
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "任务不存在");
    }

    if (data.title !== undefined) task.title = data.title;
    if (data.description !== undefined) task.description = data.description;
    if (data.assigneeMemberId !== undefined) task.assigneeMemberId = data.assigneeMemberId;
    if (data.priority !== undefined) task.priority = data.priority;
    if (data.dueDate !== undefined) task.dueDate = data.dueDate;
    if (data.status !== undefined) {
      task.status = data.status;
      if (data.status === "completed") {
        task.completedAt = new Date();
      }
    }
    if (data.teamId !== undefined && Number(data.teamId) !== Number(task.teamId)) {
      const target = await this.teamRepo.findOne({ where: { id: data.teamId } });
      if (!target) {
        BusinessException.throw(ErrorCode.NOT_FOUND, "目标团队不存在");
      }
      if (Number(target.creatorId) !== userId) {
        BusinessException.throw(ErrorCode.FORBIDDEN, "仅团队创建者可迁移任务");
      }
      task.teamId = Number(data.teamId);
    }
    if (data.result !== undefined) task.result = data.result;

    return this.taskRepo.save(task);
  }

  async listSelectableAgents(): Promise<Array<{ id: number; name: string; description?: string }>> {
    // 查询所有已发布的 Agent
    try {
      const result = await this.dataSource.query(`SELECT id, name, description FROM eco_agents WHERE status = 'published' ORDER BY name ASC LIMIT 50`);
      return result;
    } catch {
      // eco_agents 表可能不存在，返回空列表
      return [];
    }
  }

  async deleteTask(
    userId: number,
    teamId: number,
    taskId: number,
  ): Promise<void> {
    // 归属校验：仅团队创建者可删除任务（防跨团队越权删除）
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "团队不存在");
    }
    if (Number(team.creatorId) !== userId) {
      BusinessException.throw(ErrorCode.FORBIDDEN, "仅团队创建者可删除任务");
    }
    const task = await this.taskRepo.findOne({ where: { id: taskId, teamId } });
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "任务不存在");
    }
    await this.taskRepo.delete({ id: taskId });
  }

  // ============ 我的团队任务（含 auto/agent 模式，无团队归属） ============

  /** 分页查询"我的"全部团队任务（三种执行方式），回填 assigneeName（成员角色名 / Agent 名） */
  async listMyTasks(
    userId: number,
    page = 1,
    pageSize = 20,
    status?: TeamTaskStatus,
  ): Promise<Paginated<TeamTaskEntity & { assigneeName?: string }>> {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));
    const where: any = { creatorId: userId };
    if (status) where.status = status;
    const [list, total] = await this.taskRepo.findAndCount({
      where,
      skip: (p - 1) * ps,
      take: ps,
      order: { createdAt: "DESC" },
    });
    const rows = await this.fillAssigneeNames(list);
    return { list: rows, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
  }

  /** 为任务列表回填 assigneeName（计算字段，不落库）：team 模式取成员角色名，agent 模式取 Agent 名 */
  private async fillAssigneeNames(
    list: TeamTaskEntity[],
  ): Promise<Array<TeamTaskEntity & { assigneeName?: string }>> {
    if (list.length === 0) return list as any;
    const memberIds = list
      .map((t) => t.assigneeMemberId)
      .filter((x): x is number => typeof x === "number" && x > 0);
    const agentIds = list
      .filter((t) => t.executeMode === "agent")
      .map((t) => t.agentId)
      .filter((x): x is number => typeof x === "number" && x > 0);
    const memberNames = new Map<number, string>();
    const agentNames = new Map<number, string>();
    if (memberIds.length > 0) {
      try {
        const members = await this.memberRepo.find({ where: { id: In(memberIds) } });
        for (const m of members) memberNames.set(Number(m.id), m.roleTitle);
      } catch {
        /* 回填失败忽略 */
      }
    }
    if (agentIds.length > 0) {
      try {
        const agents = await this.dataSource.query(
          `SELECT id, name FROM eco_agents WHERE id IN (?)`,
          [agentIds],
        );
        for (const a of agents as Array<{ id: number | string; name: string }>) {
          agentNames.set(Number(a.id), a.name);
        }
      } catch {
        /* 回填失败忽略 */
      }
    }
    return list.map((t) => {
      const assigneeName =
        t.executeMode === "agent"
          ? t.agentId != null
            ? agentNames.get(Number(t.agentId))
            : undefined
          : t.assigneeMemberId != null
            ? memberNames.get(Number(t.assigneeMemberId))
            : undefined;
      return { ...t, ...(assigneeName ? { assigneeName } : {}) };
    });
  }

  /** 更新"我的"任务（auto/agent 模式无团队归属也可回写）；切执行方式时联动置空 */
  async updateMyTask(
    userId: number,
    taskId: number,
    data: Partial<{
      status: TeamTaskStatus;
      result: unknown;
      executeMode: "team" | "auto" | "agent";
      teamId?: number | null;
      agentId?: number;
    }>,
  ): Promise<TeamTaskEntity> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task || Number(task.creatorId) !== userId) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "任务不存在");
    }
    if (data.status !== undefined) {
      task.status = data.status;
      if (data.status === "completed") task.completedAt = new Date();
    }
    if (data.result !== undefined) task.result = data.result;
    if (data.executeMode !== undefined) task.executeMode = data.executeMode;
    if (data.teamId !== undefined) {
      if (data.teamId == null) {
        task.teamId = null;
      } else {
        const target = await this.teamRepo.findOne({ where: { id: data.teamId } });
        if (!target) {
          BusinessException.throw(ErrorCode.NOT_FOUND, "目标团队不存在");
        }
        if (Number(target.creatorId) !== userId) {
          BusinessException.throw(ErrorCode.FORBIDDEN, "仅团队创建者可迁移任务");
        }
        task.teamId = Number(data.teamId);
      }
    }
    if (data.agentId !== undefined) task.agentId = data.agentId;
    // 模式联动：team 模式 agent_id 无意义；auto/agent 模式 team_id 置空
    if (task.executeMode !== "team") task.teamId = null;
    if (task.executeMode === "team") task.agentId = undefined;
    return this.taskRepo.save(task);
  }

  /** 删除"我的"任务（归属校验：仅创建者可删） */
  async deleteMyTask(userId: number, taskId: number): Promise<void> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task || Number(task.creatorId) !== userId) {
      BusinessException.throw(ErrorCode.NOT_FOUND, "任务不存在");
    }
    await this.taskRepo.delete({ id: taskId });
  }
}
