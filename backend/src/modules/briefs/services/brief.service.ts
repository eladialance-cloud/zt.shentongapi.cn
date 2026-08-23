import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, In } from 'typeorm';
import { BriefEntity } from '../entities/brief.entity';
import { TeamEntity } from '../../team/entities/team.entity';
import { TeamMemberEntity } from '../../team/entities/team-member.entity';
import { AgentEntity } from '../../agent/entities/agent.entity';
import { BriefDispatchService, MemberRoleTitle } from './brief-dispatch.service';
import {
  CreateBriefDto,
  UpdateBriefDto,
  ConfirmBriefDto,
  BriefQueryDto,
} from '../dto/brief.dto';
import { PaginatedResult } from '../../../common/types/pagination.type';

/**
 * 需求单服务
 * 负责需求单的创建、查询、更新、确认与取消
 */
@Injectable()
export class BriefService {
  private readonly logger = new Logger(BriefService.name);

  constructor(
    @InjectRepository(BriefEntity)
    private readonly briefRepo: Repository<BriefEntity>,
    private readonly dispatchService: BriefDispatchService,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly memberRepo: Repository<TeamMemberEntity>,
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
  ) {}

  /**
   * 创建需求单
   * @param userId 用户 ID
   * @param dto 创建参数
   * @returns 新建需求单（初始状态 draft）
   */
  async create(userId: number, dto: CreateBriefDto): Promise<BriefEntity> {
    const brief = this.briefRepo.create({
      userId,
      title: dto.title,
      goal: dto.goal ?? null,
      targetAudience: dto.targetAudience ?? null,
      platforms: dto.platforms ?? null,
      style: dto.style ?? null,
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      sourceChatSessionId: dto.sourceChatSessionId ?? null,
      sourceChatSummary: dto.sourceChatSummary ?? null,
      status: 'draft',
      dispatchStatus: 'none',
    } as unknown as BriefEntity);
    return this.briefRepo.save(brief);
  }

  /**
   * 分页查询需求单列表
   * @param userId 用户 ID
   * @param query 查询参数（分页 + 状态过滤）
   * @returns 分页结果
   */
  async list(
    userId: number,
    query: BriefQueryDto,
  ): Promise<PaginatedResult<BriefEntity>> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));

    const where: FindOptionsWhere<BriefEntity> = { userId };
    if (query.status) {
      where.status = query.status;
    }

    const [list, total] = await this.briefRepo.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取需求单历史（最近 limit 条，倒序，上限 50）
   * @param userId 用户 ID
   * @param limit 返回条数上限
   * @returns 需求单列表
   */
  async history(userId: number, limit?: number): Promise<BriefEntity[]> {
    const size = Math.min(50, Math.max(1, Number(limit) || 20));
    return this.briefRepo.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: size,
    });
  }

  /**
   * 获取需求单详情（仅本人）
   * @param userId 用户 ID
   * @param id 需求单 ID
   * @returns 需求单实体
   */
  async getOne(userId: number, id: number): Promise<BriefEntity> {
    const brief = await this.briefRepo.findOne({ where: { id, userId } });
    if (!brief) {
      throw new NotFoundException(`需求单 ${id} 不存在`);
    }
    return brief;
  }

  /**
   * 更新需求单（仅 draft 可修改）
   * @param userId 用户 ID
   * @param id 需求单 ID
   * @param dto 更新参数
   * @returns 更新后的需求单
   */
  async update(
    userId: number,
    id: number,
    dto: UpdateBriefDto,
  ): Promise<BriefEntity> {
    const brief = await this.briefRepo.findOne({ where: { id, userId } });
    if (!brief) {
      throw new NotFoundException(`需求单 ${id} 不存在`);
    }
    if (brief.status !== 'draft') {
      throw new BadRequestException('需求单已确认或已结束，无法修改');
    }

    if (dto.title !== undefined) brief.title = dto.title;
    if (dto.goal !== undefined) brief.goal = dto.goal;
    if (dto.targetAudience !== undefined) brief.targetAudience = dto.targetAudience;
    if (dto.platforms !== undefined) brief.platforms = dto.platforms;
    if (dto.style !== undefined) brief.style = dto.style;
    if (dto.deadline !== undefined) {
      brief.deadline = (dto.deadline ? new Date(dto.deadline) : null) as unknown as Date;
    }
    if (dto.sourceChatSessionId !== undefined) {
      brief.sourceChatSessionId = dto.sourceChatSessionId;
    }
    if (dto.sourceChatSummary !== undefined) {
      brief.sourceChatSummary = dto.sourceChatSummary;
    }
    return this.briefRepo.save(brief);
  }

  /**
   * 确认需求单（draft → confirmed + AI 拆解派发）
   * 幂等：dispatchStatus !== 'none' 时不再触发 dispatch，直接返回当前 brief
   * confirm 先同步保存 pending 占位（天然防并发重复派发）并立即返回，
   * 派发在后台 fire-and-forget 执行：成功 → dispatchStatus='done' + dispatchResult 写入；
   * 失败 → 'failed' + dispatchResult=null
   * @param userId 用户 ID
   * @param id 需求单 ID
   * @param dto 确认参数（manualDispatch 预留）
   * @returns 已确认的需求单（dispatchStatus=pending，派发结果异步回写）
   */
  async confirm(
    userId: number,
    id: number,
    dto?: ConfirmBriefDto,
  ): Promise<BriefEntity> {
    const brief = await this.briefRepo.findOne({ where: { id, userId } });
    if (!brief) {
      throw new NotFoundException(`需求单 ${id} 不存在`);
    }
    // 指定执行团队校验：必须是当前用户创建的团队
    if (dto?.teamId != null) {
      const targetTeam = await this.teamRepo.findOne({ where: { id: dto.teamId } });
      if (!targetTeam) {
        throw new BadRequestException(`团队 ${dto.teamId} 不存在`);
      }
      if (Number(targetTeam.creatorId) !== userId) {
        throw new BadRequestException('只能选择自己创建的团队执行');
      }
    }
    // 指定单个 Agent 校验：executeMode=agent 时 agentId 必填且存在
    const executeMode = dto?.executeMode ?? 'team';
    if (executeMode === 'agent') {
      if (dto?.agentId == null) {
        throw new BadRequestException('指定单个 Agent 执行时必须提供 agentId');
      }
      const agent = await this.agentRepo.findOne({ where: { id: dto.agentId } });
      if (!agent) {
        throw new BadRequestException(`Agent ${dto.agentId} 不存在`);
      }
    }
    if (brief.dispatchStatus !== 'none') {
      return brief;
    }
    if (brief.status !== 'draft') {
      throw new BadRequestException(`当前状态 ${brief.status} 不可确认，仅 draft 可确认`);
    }
    brief.status = 'confirmed';
    brief.dispatchStatus = 'pending';
    await this.briefRepo.save(brief);
    // 后台派发：不再 await LLM 结果（避免最长 30s 阻塞与 axios 超时竞态）
    const memberRoles = await this.loadMemberRoles(userId);
    void this.dispatchService
      .dispatch(brief, memberRoles, dto?.teamId, executeMode, dto?.agentId)
      .then((result) => {
        if (result.ok) {
          brief.dispatchStatus = 'done';
          brief.dispatchResult = result.tasks ?? null;
        } else {
          brief.dispatchStatus = 'failed';
          brief.dispatchResult = null;
        }
        return this.briefRepo.save(brief);
      })
      .catch((err) => {
        // dispatch 内部已 catch 全部异常，此处兜底避免未处理 rejection
        this.logger.warn('需求单后台派发异常: ' + (err as Error).message);
        brief.dispatchStatus = 'failed';
        brief.dispatchResult = null;
        return this.briefRepo.save(brief);
      });
    return brief;
  }

  /**
   * 查询用户（作为团队创建者）名下团队成员的角色列表，供 dispatch 白名单校验与 assignee 回填
   * 查询失败降级为空列表（拆解仍进行，roleTitle 不匹配的条目被跳过）
   */
  private async loadMemberRoles(userId: number): Promise<MemberRoleTitle[]> {
    try {
      const teams = await this.teamRepo.find({
        where: { creatorId: userId },
        order: { id: 'ASC' },
      });
      if (teams.length === 0) return [];
      const members = await this.memberRepo.find({
        where: { teamId: In(teams.map((t) => t.id)), isActive: true },
      });
      return members.map((m) => ({ roleTitle: m.roleTitle, memberId: m.id }));
    } catch (e) {
      this.logger.warn('加载团队角色列表失败，降级为空列表: ' + (e as Error).message);
      return [];
    }
  }

  /**
   * 取消需求单（draft/confirmed → cancelled）
   * @param userId 用户 ID
   * @param id 需求单 ID
   * @returns 取消后的需求单
   */
  async cancel(userId: number, id: number): Promise<BriefEntity> {
    const brief = await this.briefRepo.findOne({ where: { id, userId } });
    if (!brief) {
      throw new NotFoundException(`需求单 ${id} 不存在`);
    }
    if (!['draft', 'confirmed'].includes(brief.status)) {
      throw new BadRequestException(`当前状态 ${brief.status} 不可取消`);
    }
    brief.status = 'cancelled';
    return this.briefRepo.save(brief);
  }
}