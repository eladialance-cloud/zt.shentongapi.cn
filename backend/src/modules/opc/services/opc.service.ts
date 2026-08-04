import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { OpcAgentRepoEntity } from '../entities/opc-agent-repo.entity';
import { OpcTaskEntity } from '../entities/opc-task.entity';
import { OpcTeamMemberEntity } from '../entities/opc-team-member.entity';
import { OpcTeamEntity } from '../entities/opc-team.entity';
import { AgentEntity } from '../../agent/entities/agent.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { PaginatedResult } from '../../../common/types/pagination.type';

/**
 * 字段名真源：desktop/src/types/opc.ts
 * 桌面端任务状态/优先级与 opc_tasks 表 enum 存在差异，这里做双向映射：
 *   status:   desktop todo/in_progress/done  <->  db pending/in_progress/completed
 *   priority: desktop urgent 按 high 落库（表 enum 无 urgent）
 */
type DesktopTaskStatus = 'todo' | 'in_progress' | 'done';
type DesktopTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type DbTaskStatus = 'pending' | 'in_progress' | 'completed';
type DbTaskPriority = 'low' | 'medium' | 'high';

export interface OPCTeamOut {
  id: number;
  name: string;
  description: string;
  memberCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface TeamMemberOut {
  id: number;
  teamId: number;
  agentId: number;
  agentName: string;
  agentAvatar?: string;
  role: 'leader' | 'member' | 'observer' | 'reviewer';
  status: 'active' | 'busy' | 'idle' | 'offline';
  taskCount: number;
  joinedAt: string;
}

export interface OPCTaskOut {
  id: number;
  teamId: number;
  title: string;
  description?: string;
  assigneeId?: number;
  assigneeName?: string;
  assigneeAvatar?: string;
  status: DesktopTaskStatus;
  priority: DesktopTaskPriority;
  dueDate?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface WorkflowNodeOut {
  id: number;
  name: string;
  description?: string;
  order: number;
  assigneeIds?: number[];
}

export interface SelectableAgentOut {
  id: number;
  name: string;
  avatar?: string;
  description?: string;
}

interface MemberRaw {
  id: string;
  teamId: string;
  agentId: string;
  addedAt: Date | string;
  agentName: string | null;
  agentAvatar: string | null;
}

@Injectable()
export class OpcService {
  constructor(
    @InjectRepository(OpcTeamEntity)
    private readonly teamRepo: Repository<OpcTeamEntity>,
    @InjectRepository(OpcTaskEntity)
    private readonly taskRepo: Repository<OpcTaskEntity>,
    @InjectRepository(OpcTeamMemberEntity)
    private readonly teamMemberRepo: Repository<OpcTeamMemberEntity>,
    @InjectRepository(OpcAgentRepoEntity)
    private readonly opcAgentRepo: Repository<OpcAgentRepoEntity>,
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  health() {
    return { status: 'ok', module: 'opc' };
  }

  // ============ Teams ============

  async listTeams(userId: number): Promise<OPCTeamOut[]> {
    const teams = await this.teamRepo
      .createQueryBuilder('t')
      .where('t.creator_id = :userId', { userId })
      .orWhere(
        't.id IN (SELECT m.team_id FROM opc_team_members m WHERE m.user_id = :memberUserId)',
        { memberUserId: userId },
      )
      .orderBy('t.created_at', 'DESC')
      .getMany();

    if (teams.length === 0) return [];

    const taskCounts = await this.getTaskCounts(teams.map(t => Number(t.id)));
    return teams.map(t => this.toTeam(t, taskCounts.get(Number(t.id)) ?? 0));
  }

  async createTeam(
    userId: number,
    data: { name: string; description?: string; memberAgentIds?: number[] },
  ): Promise<OPCTeamOut> {
    const name = data?.name?.trim();
    if (!name) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '团队名称不能为空');
    }

    const memberAgentIds = (data?.memberAgentIds ?? []).map(Number);
    let agents: AgentEntity[] = [];
    if (memberAgentIds.length > 0) {
      agents = await this.agentRepo.find({
        where: { id: In(memberAgentIds), status: 'published' },
      });
      if (agents.length !== memberAgentIds.length) {
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, '存在无效或未发布的 Agent');
      }
    }

    const saved = await this.dataSource.transaction(async manager => {
      const savedTeam = await manager.getRepository(OpcTeamEntity).save(
        manager.getRepository(OpcTeamEntity).create({
          name,
          description: data?.description,
          memberCount: memberAgentIds.length,
          creatorId: userId,
        }),
      );

      // 创建者作为 owner 记录到团队成员表（后续用户成员/权限扩展用）
      await manager.getRepository(OpcTeamMemberEntity).save(
        manager.getRepository(OpcTeamMemberEntity).create({
          teamId: savedTeam.id,
          userId,
          role: 'owner',
        }),
      );

      if (agents.length > 0) {
        const repoRows = agents.map(a =>
          manager.getRepository(OpcAgentRepoEntity).create({
            teamId: savedTeam.id,
            agentId: a.id,
            agentName: a.name,
            agentAvatar: a.avatar,
            description: a.description,
            version: String(a.version ?? 1),
            addedBy: userId,
          }),
        );
        await manager.getRepository(OpcAgentRepoEntity).save(repoRows);
      }

      return savedTeam;
    });

    return this.toTeam(saved, 0);
  }

  async getTeamDetail(
    userId: number,
    teamId: number,
  ): Promise<{ team: OPCTeamOut; workflow: WorkflowNodeOut[] }> {
    const team = await this.assertTeamAccess(userId, teamId);
    const taskCount = (await this.getTaskCounts([teamId])).get(teamId) ?? 0;
    // 当前无 workflow 表/字段，先返回空列表（桌面端 workflow 为可选字段）
    return { team: this.toTeam(team, taskCount), workflow: [] };
  }

  async deleteTeam(userId: number, teamId: number): Promise<void> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    // 非本人/不存在统一 404（NOT_FOUND），避免泄露团队存在性
    if (!team || Number(team.creatorId) !== userId) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '团队不存在');
    }
    await this.dataSource.transaction(async manager => {
      await manager.delete(OpcTeamMemberEntity, { teamId });
      await manager.delete(OpcAgentRepoEntity, { teamId });
      await manager.delete(OpcTaskEntity, { teamId });
      await manager.delete(OpcTeamEntity, { id: teamId });
    });
  }

  // ============ Members ============

  async listMembers(userId: number, teamId: number): Promise<TeamMemberOut[]> {
    await this.assertTeamAccess(userId, teamId);

    const rows = await this.opcAgentRepo
      .createQueryBuilder('r')
      .leftJoin(AgentEntity, 'a', 'a.id = r.agent_id')
      .where('r.team_id = :teamId', { teamId })
      .select('r.id', 'id')
      .addSelect('r.team_id', 'teamId')
      .addSelect('r.agent_id', 'agentId')
      .addSelect('r.added_at', 'addedAt')
      .addSelect('COALESCE(a.name, r.agent_name)', 'agentName')
      .addSelect('a.avatar', 'agentAvatar')
      .orderBy('r.added_at', 'ASC')
      .getRawMany<MemberRaw>();

    if (rows.length === 0) return [];

    const agentIds = [...new Set(rows.map(r => Number(r.agentId)))];
    const countRows = await this.taskRepo
      .createQueryBuilder('tk')
      .select('tk.assignee_id', 'assigneeId')
      .addSelect('COUNT(*)', 'cnt')
      .where('tk.team_id = :teamId', { teamId })
      .andWhere('tk.assignee_id IN (:...agentIds)', { agentIds })
      .groupBy('tk.assignee_id')
      .getRawMany<{ assigneeId: string; cnt: string }>();
    const taskCounts = new Map(countRows.map(r => [Number(r.assigneeId), Number(r.cnt)]));

    return rows.map(r => ({
      id: Number(r.id),
      teamId: Number(r.teamId),
      agentId: Number(r.agentId),
      agentName: r.agentName || 'Agent #' + r.agentId,
      agentAvatar: r.agentAvatar ?? undefined,
      role: 'member',
      status: 'active',
      taskCount: taskCounts.get(Number(r.agentId)) ?? 0,
      joinedAt: r.addedAt ? new Date(r.addedAt).toISOString() : '',
    }));
  }

  // ============ Tasks ============

  async listTasks(
    userId: number,
    teamId: number,
    query: { status?: string; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<OPCTaskOut>> {
    await this.assertTeamAccess(userId, teamId);

    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize) || 20));

    const qb = this.taskRepo
      .createQueryBuilder('tk')
      .where('tk.team_id = :teamId', { teamId });

    if (query?.status !== undefined && query.status !== '') {
      const status = String(query.status) as DesktopTaskStatus;
      if (!['todo', 'in_progress', 'done'].includes(status)) {
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, '无效的任务状态');
      }
      qb.andWhere('tk.status = :status', { status: this.mapDesktopStatus(status) });
    }

    const [list, total] = await qb
      .orderBy('tk.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const assigneeIds = [
      ...new Set(
        list
          .map(t => t.assigneeId)
          .filter((v): v is number => v != null)
          .map(Number),
      ),
    ];
    let agentMap = new Map<number, AgentEntity>();
    if (assigneeIds.length > 0) {
      const agents = await this.agentRepo.find({ where: { id: In(assigneeIds) } });
      agentMap = new Map(agents.map(a => [Number(a.id), a]));
    }

    return {
      list: list.map(t => this.toTask(t, t.assigneeId != null ? agentMap.get(Number(t.assigneeId)) : undefined)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async updateTask(
    userId: number,
    taskId: number,
    data: Record<string, any>,
  ): Promise<OPCTaskOut> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '任务不存在');
    }
    await this.assertTeamAccess(userId, Number(task.teamId));

    if (data?.status !== undefined) {
      const status = String(data.status) as DesktopTaskStatus;
      if (!['todo', 'in_progress', 'done'].includes(status)) {
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, '无效的任务状态');
      }
      task.status = this.mapDesktopStatus(status);
    }
    if (data?.title !== undefined) {
      task.title = String(data.title);
    }
    if (data?.description !== undefined) {
      task.description = data.description == null ? undefined : String(data.description);
    }
    if (data?.assigneeId !== undefined) {
      task.assigneeId = data.assigneeId == null ? undefined : Number(data.assigneeId);
    }
    if (data?.priority !== undefined) {
      const priority = String(data.priority) as DesktopTaskPriority;
      if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, '无效的任务优先级');
      }
      task.priority = this.mapDesktopPriority(priority);
    }
    if (data?.dueDate !== undefined) {
      task.dueDate =
        data.dueDate == null || data.dueDate === ''
          ? undefined
          : new Date(String(data.dueDate));
    }

    const saved = await this.taskRepo.save(task);
    let agent: AgentEntity | undefined;
    if (saved.assigneeId != null) {
      const found = await this.agentRepo.findOne({ where: { id: Number(saved.assigneeId) } });
      agent = found ?? undefined;
    }
    return this.toTask(saved, agent);
  }

  // ============ Agents ============

  async listSelectableAgents(): Promise<SelectableAgentOut[]> {
    const agents = await this.agentRepo.find({
      where: { status: 'published' },
      order: { name: 'ASC' },
      take: 100,
    });
    return agents.map(a => ({
      id: Number(a.id),
      name: a.name,
      avatar: a.avatar ?? undefined,
      description: a.description ?? undefined,
    }));
  }

  // ============ Helpers ============

  private async assertTeamAccess(userId: number, teamId: number): Promise<OpcTeamEntity> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '团队不存在');
    }
    if (Number(team.creatorId) === userId) return team;
    const member = await this.teamMemberRepo.findOne({ where: { teamId, userId } });
    if (!member) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '团队不存在');
    }
    return team;
  }

  private async getTaskCounts(teamIds: number[]): Promise<Map<number, number>> {
    if (teamIds.length === 0) return new Map();
    const rows = await this.taskRepo
      .createQueryBuilder('tk')
      .select('tk.team_id', 'teamId')
      .addSelect('COUNT(*)', 'cnt')
      .where('tk.team_id IN (:...teamIds)', { teamIds })
      .groupBy('tk.team_id')
      .getRawMany<{ teamId: string; cnt: string }>();
    return new Map(rows.map(r => [Number(r.teamId), Number(r.cnt)]));
  }

  private toTeam(team: OpcTeamEntity, taskCount: number): OPCTeamOut {
    return {
      id: Number(team.id),
      name: team.name,
      description: team.description ?? '',
      memberCount: Number(team.memberCount ?? 0),
      taskCount,
      createdAt: team.createdAt ? new Date(team.createdAt).toISOString() : '',
      updatedAt: team.updatedAt ? new Date(team.updatedAt).toISOString() : undefined,
    };
  }

  private toTask(task: OpcTaskEntity, agent?: AgentEntity): OPCTaskOut {
    return {
      id: Number(task.id),
      teamId: Number(task.teamId),
      title: task.title,
      description: task.description ?? undefined,
      assigneeId: task.assigneeId != null ? Number(task.assigneeId) : undefined,
      assigneeName: agent?.name ?? undefined,
      assigneeAvatar: agent?.avatar ?? undefined,
      status: this.mapDbStatus(task.status),
      priority: this.mapDbPriority(task.priority),
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
      createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : '',
      updatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : undefined,
    };
  }

  private mapDbStatus(status: DbTaskStatus): DesktopTaskStatus {
    switch (status) {
      case 'pending':
        return 'todo';
      case 'completed':
        return 'done';
      default:
        return 'in_progress';
    }
  }

  private mapDesktopStatus(status: DesktopTaskStatus): DbTaskStatus {
    switch (status) {
      case 'todo':
        return 'pending';
      case 'done':
        return 'completed';
      default:
        return 'in_progress';
    }
  }

  private mapDbPriority(priority: DbTaskPriority): DesktopTaskPriority {
    return priority;
  }

  private mapDesktopPriority(priority: DesktopTaskPriority): DbTaskPriority {
    return priority === 'urgent' ? 'high' : priority;
  }
}
