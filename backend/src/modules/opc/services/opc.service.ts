import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { OpcTeamEntity } from '../entities/opc-team.entity';
import { OpcTeamMemberEntity } from '../entities/opc-team-member.entity';
import { OpcTaskEntity } from '../entities/opc-task.entity';
import { OpcAgentRepoEntity } from '../entities/opc-agent-repo.entity';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';

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
  ) {}

  health() {
    return { status: 'ok', module: 'opc' };
  }

  // ============ 团队 ============

  /** 当前用户的团队列表 */
  async listTeams(userId: number): Promise<OpcTeamEntity[]> {
    // 查找用户参与的团队（通过 team_members 关联）
    const members = await this.memberRepo.find({
      where: { userId },
      select: ['teamId'],
    });

    if (members.length === 0) {
      return [];
    }

    const teamIds = members.map((m) => m.teamId);
    return this.teamRepo
      .createQueryBuilder('team')
      .where('team.id IN (:...teamIds)', { teamIds })
      .orderBy('team.created_at', 'DESC')
      .getMany();
  }

  /** 创建团队 */
  async createTeam(
    userId: number,
    dto: {
      name: string;
      description?: string;
      memberAgentIds?: number[];
    },
  ): Promise<OpcTeamEntity> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('团队名称不能为空');
    }

    // 创建团队
    const team = this.teamRepo.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      creatorId: userId,
      memberCount: 1, // 创建者自身
    });
    const saved = await this.teamRepo.save(team);

    // 创建者自动成为 owner
    await this.memberRepo.save(
      this.memberRepo.create({
        teamId: saved.id,
        userId,
        role: 'owner',
      }),
    );

    // 如果提供了 memberAgentIds，为每个 agent 创建成员记录
    if (dto.memberAgentIds && dto.memberAgentIds.length > 0) {
      // 查询这些 agent 的信息（从 opc_agent_repos 表）
      const agents = await this.agentRepo
        .createQueryBuilder('a')
        .where('a.agent_id IN (:...ids)', { ids: dto.memberAgentIds })
        .getMany();

      // 按 agentId 去重（可能同一 agent 在多个团队 repo 中都有记录）
      const agentMap = new Map<number, OpcAgentRepoEntity>();
      for (const a of agents) {
        if (!agentMap.has(a.agentId)) {
          agentMap.set(a.agentId, a);
        }
      }

      const memberRecords: OpcTeamMemberEntity[] = [];
      for (const agentId of dto.memberAgentIds) {
        // 跳过与创建者相同 userId 的情况（虽然 agentId 不太可能等于 userId，但防御性处理）
        const agentInfo = agentMap.get(agentId);
        memberRecords.push(
          this.memberRepo.create({
            teamId: saved.id,
            userId: agentId, // agent 作为团队成员，用 agentId 作为 userId 标识
            role: 'member',
          }),
        );
      }

      if (memberRecords.length > 0) {
        await this.memberRepo.save(memberRecords);
      }

      // 更新成员数
      saved.memberCount = 1 + memberRecords.length;
      await this.teamRepo.save(saved);
    }

    return saved;
  }

  /** 删除团队（校验归属权） */
  async deleteTeam(userId: number, teamId: number): Promise<void> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('团队不存在');
    }
    if (team.creatorId !== userId) {
      throw new ForbiddenException('无权操作此团队');
    }

    // 删除关联成员
    await this.memberRepo.delete({ teamId });
    // 删除关联任务
    await this.taskRepo.delete({ teamId });
    // 删除团队
    await this.teamRepo.delete({ id: teamId });
  }

  /** 团队详情 */
  async getTeamDetail(
    userId: number,
    teamId: number,
  ): Promise<{ team: OpcTeamEntity }> {
    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('团队不存在');
    }

    // 校验用户是否为团队成员
    await this.assertTeamMember(userId, teamId);

    return { team };
  }

  // ============ 成员 ============

  /** 成员列表 */
  async listMembers(
    userId: number,
    teamId: number,
  ): Promise<OpcTeamMemberEntity[]> {
    // 校验团队成员归属权
    await this.assertTeamMember(userId, teamId);

    return this.memberRepo.find({
      where: { teamId },
      order: { joinedAt: 'ASC' },
    });
  }

  // ============ 任务 ============

  /** 任务列表（分页） */
  async listTasks(
    userId: number,
    teamId: number,
    query: PaginationQuery & { status?: string },
  ): Promise<PaginatedResult<OpcTaskEntity>> {
    // 校验团队成员归属权
    await this.assertTeamMember(userId, teamId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .where('task.team_id = :teamId', { teamId })
      .orderBy('task.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.status) {
      qb.andWhere('task.status = :status', { status: query.status });
    }

    if (query.keyword) {
      qb.andWhere('(task.title LIKE :kw OR task.description LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    const [list, total] = await qb.getManyAndCount();
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 更新任务 */
  async updateTask(
    userId: number,
    taskId: number,
    dto: {
      status?: string;
      title?: string;
      description?: string;
    },
  ): Promise<OpcTaskEntity> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    // 校验用户是否为团队成员
    await this.assertTeamMember(userId, task.teamId);

    if (dto.status !== undefined) {
      task.status = dto.status as OpcTaskEntity['status'];
    }
    if (dto.title !== undefined) {
      task.title = dto.title;
    }
    if (dto.description !== undefined) {
      task.description = dto.description;
    }

    return this.taskRepo.save(task);
  }

  // ============ Agent ============

  /** 可选 Agent 列表（从 OpcAgentRepoEntity 查） */
  async listAgents(): Promise<
    Array<{
      id: number;
      name: string;
      avatar?: string;
      description?: string;
    }>
  > {
    // 查询所有 agent repo 记录，按 agentId 去重
    const agents = await this.agentRepo
      .createQueryBuilder('a')
      .orderBy('a.added_at', 'DESC')
      .getMany();

    // 按 agentId 去重，保留最新一条
    const agentMap = new Map<number, OpcAgentRepoEntity>();
    for (const a of agents) {
      if (!agentMap.has(a.agentId)) {
        agentMap.set(a.agentId, a);
      }
    }

    return Array.from(agentMap.values()).map((a) => ({
      id: a.agentId,
      name: a.agentName,
      avatar: a.agentAvatar,
      description: a.description,
    }));
  }

  // ============ 辅助方法 ============

  /** 校验用户是否为团队成员，否则抛 ForbiddenException */
  private async assertTeamMember(
    userId: number,
    teamId: number,
  ): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { teamId, userId },
    });
    if (!member) {
      throw new ForbiddenException('您不是该团队的成员');
    }
  }
}
