import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OpcTeamEntity } from '../entities/opc-team.entity';
import { OpcTeamMemberEntity } from '../entities/opc-team-member.entity';
import { OpcTaskEntity } from '../entities/opc-task.entity';
import { OpcAgentRepoEntity } from '../entities/opc-agent-repo.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

type OpcTaskStatus = 'pending' | 'in_progress' | 'completed';
type OpcTaskPriority = 'low' | 'medium' | 'high';
type OpcMemberRole = 'owner' | 'admin' | 'member';

export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

@Injectable()
export class OpcService {
  constructor(
    @InjectRepository(OpcTeamEntity)
    private readonly teamRepo: Repository<OpcTeamEntity>,
    @InjectRepository(OpcTeamMemberEntity)
    private readonly memberRepo: Repository<OpcTeamMemberEntity>,
    @InjectRepository(OpcTaskEntity)
    private readonly taskRepo: Repository<OpcTaskEntity>,
    @InjectRepository(OpcAgentRepoEntity)
    private readonly agentRepo: Repository<OpcAgentRepoEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  health() {
    return { status: 'ok', module: 'opc' };
  }

  // ============ Teams ============

  async listTeams(
    userId: number,
    page = 1,
    pageSize = 20,
  ): Promise<Paginated<OpcTeamEntity>> {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));

    const [memberships, total] = await this.memberRepo.findAndCount({
      where: { userId },
      skip: (p - 1) * ps,
      take: ps,
      order: { joinedAt: 'DESC' },
    });

    if (memberships.length === 0) {
      return { list: [], total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
    }

    const teamIds = memberships.map((m) => m.teamId);
    const teams = await this.teamRepo.find({
      where: teamIds.map((id) => ({ id })),
      order: { createdAt: 'DESC' },
    });

    return { list: teams, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
  }

  async createTeam(
    userId: number,
    data: { name: string; description?: string; avatar?: string },
  ): Promise<OpcTeamEntity> {
    return this.dataSource.transaction(async (manager) => {
      const teamRepo = manager.getRepository(OpcTeamEntity);
      const memberRepo = manager.getRepository(OpcTeamMemberEntity);

      const team = teamRepo.create({
        name: data.name,
        avatar: data.avatar,
        description: data.description,
        memberCount: 1,
        creatorId: userId,
      });
      const saved = await teamRepo.save(team);

      const member = memberRepo.create({
        teamId: saved.id,
        userId,
        role: 'owner',
      });
      await memberRepo.save(member);

      return saved;
    });
  }

  async getTeamDetail(
    userId: number,
    teamId: number,
  ): Promise<{ team: OpcTeamEntity; role: OpcMemberRole }> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '鍥㈤槦涓嶅瓨鍦?);
    }
    const membership = await this.assertMember(userId, teamId);
    return { team, role: membership.role };
  }

  async updateTeam(
    userId: number,
    teamId: number,
    data: { name?: string; description?: string; avatar?: string },
  ): Promise<OpcTeamEntity> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '鍥㈤槦涓嶅瓨鍦?);
    }
    await this.assertAdmin(userId, teamId);

    if (data.name !== undefined) team.name = data.name;
    if (data.description !== undefined) team.description = data.description;
    if (data.avatar !== undefined) team.avatar = data.avatar;

    return this.teamRepo.save(team);
  }

  async deleteTeam(userId: number, teamId: number): Promise<void> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '鍥㈤槦涓嶅瓨鍦?);
    }
    await this.assertOwner(userId, teamId);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(OpcTeamMemberEntity, { teamId });
      await manager.delete(OpcTaskEntity, { teamId });
      await manager.delete(OpcAgentRepoEntity, { teamId });
      await manager.delete(OpcTeamEntity, { id: teamId });
    });
  }

  // ============ Members ============

  async listMembers(
    userId: number,
    teamId: number,
  ): Promise<OpcTeamMemberEntity[]> {
    await this.assertMember(userId, teamId);
    return this.memberRepo.find({
      where: { teamId },
      order: { joinedAt: 'ASC' },
    });
  }

  async addMember(
    userId: number,
    teamId: number,
    targetUserId: number,
    role: 'admin' | 'member',
  ): Promise<OpcTeamMemberEntity> {
    await this.assertAdmin(userId, teamId);

    if (userId === targetUserId) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '涓嶈兘娣诲姞鑷繁涓烘垚鍛?);
    }

    return this.dataSource.transaction(async (manager) => {
      const memberRepo = manager.getRepository(OpcTeamMemberEntity);
      const teamRepo = manager.getRepository(OpcTeamEntity);

      const exists = await memberRepo.findOne({
        where: { teamId, userId: targetUserId },
      });
      if (exists) {
        BusinessException.throw(ErrorCode.USER_EXISTS, '璇ョ敤鎴峰凡鏄洟闃熸垚鍛?);
      }

      const member = memberRepo.create({
        teamId,
        userId: targetUserId,
        role,
      });
      const saved = await memberRepo.save(member);

      await teamRepo.increment({ id: teamId }, 'memberCount', 1);

      return saved;
    });
  }

  async removeMember(
    userId: number,
    teamId: number,
    targetUserId: number,
  ): Promise<void> {
    await this.assertAdmin(userId, teamId);

    return this.dataSource.transaction(async (manager) => {
      const memberRepo = manager.getRepository(OpcTeamMemberEntity);
      const teamRepo = manager.getRepository(OpcTeamEntity);

      const member = await memberRepo.findOne({
        where: { teamId, userId: targetUserId },
      });
      if (!member) {
        BusinessException.throw(ErrorCode.NOT_FOUND, '鎴愬憳涓嶅瓨鍦?);
      }
      if (member.role === 'owner') {
        BusinessException.throw(ErrorCode.FORBIDDEN, '涓嶈兘绉婚櫎鍥㈤槦鎵€鏈夎€?);
      }

      await memberRepo.delete({ id: member.id });
      await teamRepo.decrement({ id: teamId }, 'memberCount', 1);
    });
  }

  async updateMemberRole(
    userId: number,
    teamId: number,
    targetUserId: number,
    role: 'admin' | 'member',
  ): Promise<OpcTeamMemberEntity> {
    await this.assertOwner(userId, teamId);

    if (userId === targetUserId) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '涓嶈兘淇敼鑷繁鐨勮鑹?);
    }

    const member = await this.memberRepo.findOne({
      where: { teamId, userId: targetUserId },
    });
    if (!member) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '鎴愬憳涓嶅瓨鍦?);
    }

    member.role = role;
    return this.memberRepo.save(member);
  }

  // ============ Tasks ============

  async listTasks(
    userId: number,
    teamId: number,
    page = 1,
    pageSize = 20,
    status?: OpcTaskStatus,
    priority?: 'low' | 'medium' | 'high',
  ): Promise<Paginated<OpcTaskEntity>> {
    await this.assertMember(userId, teamId);

    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));

    const where: { teamId: number; status?: OpcTaskStatus; priority?: 'low' | 'medium' | 'high' } = { teamId };
    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }

    const [list, total] = await this.taskRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (p - 1) * ps,
      take: ps,
    });

    return { list, total, page: p, pageSize: ps };
  }

  async createTask(
    userId: number,
    teamId: number,
    data: {
      title: string;
      description?: string;
      assigneeId?: number;
      priority?: OpcTaskPriority;
      dueDate?: Date;
    },
  ): Promise<OpcTaskEntity> {
    await this.assertMember(userId, teamId);

    const task = this.taskRepo.create({
      teamId,
      title: data.title,
      description: data.description,
      status: 'pending',
      assigneeId: data.assigneeId,
      creatorId: userId,
      priority: data.priority ?? 'medium',
      dueDate: data.dueDate,
    });
    return this.taskRepo.save(task);
  }

  async getTask(
    userId: number,
    teamId: number,
    taskId: number,
  ): Promise<OpcTaskEntity> {
    await this.assertMember(userId, teamId);
    const task = await this.taskRepo.findOne({ where: { id: taskId, teamId } });
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '浠诲姟涓嶅瓨鍦?);
    }
    return task;
  }

  async updateTask(
    userId: number,
    teamId: number,
    taskId: number,
    data: Partial<{
      title: string;
      description: string;
      assigneeId: number;
      priority: OpcTaskPriority;
      dueDate: Date;
      status: OpcTaskStatus;
    }>,
  ): Promise<OpcTaskEntity> {
    await this.assertMember(userId, teamId);
    const task = await this.taskRepo.findOne({ where: { id: taskId, teamId } });
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '浠诲姟涓嶅瓨鍦?);
    }

    if (data.title !== undefined) task.title = data.title;
    if (data.description !== undefined) task.description = data.description;
    if (data.assigneeId !== undefined) task.assigneeId = data.assigneeId;
    if (data.priority !== undefined) task.priority = data.priority;
    if (data.dueDate !== undefined) task.dueDate = data.dueDate;
    if (data.status !== undefined) task.status = data.status;

    return this.taskRepo.save(task);
  }

  async deleteTask(
    userId: number,
    teamId: number,
    taskId: number,
  ): Promise<void> {
    const task = await this.taskRepo.findOne({ where: { id: taskId, teamId } });
    if (!task) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '浠诲姟涓嶅瓨鍦?);
    }

    const membership = await this.assertMember(userId, teamId);
    const isCreator = task.creatorId === userId;
    const isAdminish = membership.role === 'owner' || membership.role === 'admin';
    if (!isCreator && !isAdminish) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '鏃犳潈鍒犻櫎璇ヤ换鍔?);
    }

    await this.taskRepo.delete({ id: taskId });
  }

  // ============ Agent Repos ============

  async listTeamAgents(
    userId: number,
    teamId: number,
  ): Promise<OpcAgentRepoEntity[]> {
    await this.assertMember(userId, teamId);
    return this.agentRepo.find({
      where: { teamId },
      order: { addedAt: 'DESC' },
    });
  }

  async addTeamAgent(
    userId: number,
    teamId: number,
    agentId: number,
  ): Promise<OpcAgentRepoEntity> {
    await this.assertAdmin(userId, teamId);

    const exists = await this.agentRepo.findOne({ where: { teamId, agentId } });
    if (exists) {
      BusinessException.throw(ErrorCode.USER_EXISTS, '璇?Agent 宸叉坊鍔犲埌鍥㈤槦');
    }

    const agent = this.agentRepo.create({
      teamId,
      agentId,
      addedBy: userId,
    });
    return this.agentRepo.save(agent);
  }

  async removeTeamAgent(
    userId: number,
    teamId: number,
    agentId: number,
  ): Promise<void> {
    await this.assertAdmin(userId, teamId);
    const agent = await this.agentRepo.findOne({ where: { teamId, agentId } });
    if (!agent) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '鍥㈤槦鏈叧鑱旇 Agent');
    }
    await this.agentRepo.delete({ id: agent.id });
  }

  // ============ Helpers ============

  private async assertMember(
    userId: number,
    teamId: number,
  ): Promise<OpcTeamMemberEntity> {
    const member = await this.memberRepo.findOne({ where: { teamId, userId } });
    if (!member) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '鎮ㄤ笉鏄鍥㈤槦鎴愬憳');
    }
    return member;
  }

  private async assertAdmin(
    userId: number,
    teamId: number,
  ): Promise<OpcTeamMemberEntity> {
    const member = await this.assertMember(userId, teamId);
    if (member.role !== 'owner' && member.role !== 'admin') {
      BusinessException.throw(ErrorCode.FORBIDDEN, '闇€瑕佺鐞嗗憳鏉冮檺');
    }
    return member;
  }

  private async assertOwner(
    userId: number,
    teamId: number,
  ): Promise<OpcTeamMemberEntity> {
    const member = await this.assertMember(userId, teamId);
    if (member.role !== 'owner') {
      BusinessException.throw(ErrorCode.FORBIDDEN, '闇€瑕佸洟闃熸墍鏈夎€呮潈闄?);
    }
    return member;
  }
}
