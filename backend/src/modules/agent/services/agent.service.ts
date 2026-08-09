import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentEntity } from '../entities/agent.entity';
import { AgentCallLogEntity } from '../entities/agent-call-log.entity';
import { AgentFavoriteEntity } from '../entities/agent-favorite.entity';
import { AgentRatingEntity } from '../entities/agent-rating.entity';
import { AgentInstallEntity } from '../entities/agent-install.entity';
import { WithdrawalRecordEntity } from '../../payment/entities/withdrawal-record.entity';
import { ModelService } from '../../model/services/model.service';
import { CreateReviewDto } from '../dto/create-review.dto';
import { CreateAgentDto } from '../dto/create-agent.dto';
import { UpdateAgentDto } from '../dto/update-agent.dto';
import { PaginatedResult } from '../../../common/types/pagination.type';
import { calcPagination } from '../../../common/utils/pagination.util';

const DISPLAY_NAMES: Record<string, string> = {
  office: '办公',
  programming: '编程',
  copywriting: '文案',
  data_analysis: '数据分析',
  other: '其他',
};

/**
 * 官方常见 Agent 中文化对照表（英文名 → 中文显示名/描述）
 * 命中后自动覆盖 displayName/description，未命中保持后台录入原样。
 * 新增英文 Agent 只需在此表加一行。
 */
const AGENT_ZH_MAP: Record<string, { displayName: string; description?: string }> = {
  'DeepSeek Chat': {
    displayName: 'DeepSeek 对话',
    description: 'DeepSeek 通用大语言模型，支持多轮对话、代码与文本生成。',
  },
  'DeepSeek-V3': {
    displayName: 'DeepSeek V3',
    description: 'DeepSeek V3 大语言模型，擅长推理、代码与长文本处理。',
  },
  'DeepSeek-R1': {
    displayName: 'DeepSeek R1',
    description: 'DeepSeek R1 推理模型，擅长逻辑推理与复杂问题求解。',
  },
  'Web Search': {
    displayName: '联网搜索',
    description: '联网搜索工具 Agent，可实时检索互联网信息并整理回答。',
  },
  'Image Generator': {
    displayName: '图片生成',
    description: 'AI 图片生成 Agent，根据文字描述生成图片。',
  },
};

const REVIEW_STATUSES = ['approved', 'paid', 'completed'];

interface ModelOption {
  id: number;
  name: string;
  provider?: string;
}

@Injectable()
export class AgentService {
  constructor(
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
    @InjectRepository(AgentCallLogEntity)
    private readonly callLogRepo: Repository<AgentCallLogEntity>,
    @InjectRepository(AgentFavoriteEntity)
    private readonly favoriteRepo: Repository<AgentFavoriteEntity>,
    @InjectRepository(AgentRatingEntity)
    private readonly ratingRepo: Repository<AgentRatingEntity>,
    @InjectRepository(AgentInstallEntity)
    private readonly installRepo: Repository<AgentInstallEntity>,
    @InjectRepository(WithdrawalRecordEntity)
    private readonly withdrawalRepo: Repository<WithdrawalRecordEntity>,
    private readonly modelService: ModelService,
  ) {}

  health() {
    return { status: 'ok', module: 'agent' };
  }

  // ============ 市场 ============

  /**
   * Agent 市场列表（仅返回已上架且可见的 Agent）
   * GET /agents/market
   */
  async marketList(query: {
    page: number;
    pageSize: number;
    tab?: string;
    category?: string;
    keyword?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, pageSize, tab, category, keyword } = query;
    const qb = this.agentRepo.createQueryBuilder('a');
    qb.where('a.status = :status', { status: 'published' });
    qb.andWhere('a.official_visible = :visible', { visible: true });

    if (tab === 'official') {
      qb.andWhere('a.is_official = :official', { official: true });
    } else if (tab === 'community') {
      qb.andWhere('a.is_official = :official', { official: false });
    }
    if (category) {
      qb.andWhere('a.category = :category', { category });
    }
    if (keyword) {
      qb.andWhere('(a.name LIKE :kw OR a.display_name LIKE :kw OR a.description LIKE :kw)', {
        kw: '%' + keyword + '%',
      });
    }

    qb.orderBy('a.published_at', 'DESC').addOrderBy('a.id', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [agents, total] = await qb.getManyAndCount();
    const creatorNames = await this.batchCreatorNames(agents);

    return {
      list: agents.map((a) =>
        this.toMarketAgent(a, creatorNames.get(a.creatorId)),
      ),
      ...calcPagination(total, page, pageSize),
    };
  }

  /** 市场详情 */
  async marketDetail(id: number) {
    const agent = await this.findPublished(id);
    const creatorName = await this.findCreatorName(agent.creatorId);
    return this.toMarketAgent(agent, creatorName);
  }

  // ============ 评价 ============

  /** 评价列表（基于 agent_ratings 用户评分表） */
  async listReviews(agentId: number) {
    await this.findPublished(agentId);
    const rows = await this.ratingRepo
      .createQueryBuilder('r')
      .leftJoin('users', 'u', 'u.id = r.user_id')
      .select([
        'r.id AS id',
        'r.user_id AS userId',
        'u.username AS username',
        'u.avatar AS avatar',
        'r.rating AS rating',
        'r.review AS comment',
        'r.created_at AS createdAt',
      ])
      .where('r.agent_id = :agentId', { agentId })
      .orderBy('r.created_at', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.userId),
      username: r.username || '',
      avatar: r.avatar || undefined,
      rating: Number(r.rating),
      comment: r.comment || '',
      createdAt: r.createdAt,
    }));
  }

  /** 创建评价（upsert，并重算 Agent 平均分） */
  async createReview(
    agentId: number,
    userId: number,
    dto: CreateReviewDto,
  ): Promise<void> {
    await this.findPublished(agentId);
    const rating = Number(dto.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('评分必须在 1-5 之间');
    }

    let record = await this.ratingRepo.findOne({
      where: { userId, agentId },
    });
    if (record) {
      record.rating = rating;
      record.review = dto.comment;
    } else {
      record = this.ratingRepo.create({
        userId,
        agentId,
        rating,
        review: dto.comment,
      });
    }
    await this.ratingRepo.save(record);
    await this.recalcAgentRating(agentId);
  }

  // ============ 收藏 ============

  /** 收藏（幂等） */
  async favorite(agentId: number, userId: number): Promise<void> {
    await this.findPublished(agentId);
    const exists = await this.favoriteRepo.findOne({
      where: { userId, agentId },
    });
    if (!exists) {
      await this.favoriteRepo.save(
        this.favoriteRepo.create({ userId, agentId }),
      );
    }
  }

  /** 取消收藏（幂等） */
  async unfavorite(agentId: number, userId: number): Promise<void> {
    const exists = await this.favoriteRepo.findOne({
      where: { userId, agentId },
    });
    if (exists) {
      await this.favoriteRepo.delete(exists.id);
    }
  }

  /** 我的收藏列表 */
  async listFavorites(userId: number) {
    const favs = await this.favoriteRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const ids = favs.map((f) => f.agentId);
    if (!ids.length) return [];
    const agents = await this.publishedAgentsByIds(ids);
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const creatorNames = await this.batchCreatorNames(agents);

    return favs
      .filter((f) => agentMap.has(f.agentId))
      .map((f) => {
        const agent = agentMap.get(f.agentId)!;
        return this.toMarketAgent(
          agent,
          creatorNames.get(agent.creatorId),
          true,
        );
      });
  }

  // ============ 使用记录 ============

  /** 我的使用记录（分页） */
  async listUsageLogs(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<unknown>> {
    const qb = this.callLogRepo
      .createQueryBuilder('cl')
      .leftJoin('agents', 'a', 'a.id = cl.agent_id')
      .select([
        'cl.id AS id',
        'cl.agent_id AS agentId',
        'a.name AS agentName',
        'cl.user_id AS userId',
        'cl.credits_cost AS creditsCost',
        'cl.token_usage AS tokenUsage',
        'cl.success AS success',
        'cl.error AS error',
        'cl.session_id AS sessionId',
        'cl.created_at AS createdAt',
      ])
      .where('cl.user_id = :userId', { userId })
      .orderBy('cl.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await Promise.all([
      qb.getRawMany(),
      this.callLogRepo.count({ where: { userId } }),
    ]);

    return {
      list: rows.map((r) => ({
        id: Number(r.id),
        agentId: Number(r.agentId),
        agentName: r.agentName || '',
        userId: Number(r.userId),
        creditsCost: Number(r.creditsCost) || 0,
        tokenUsage: this.toTokenUsage(r.tokenUsage),
        status: r.success ? 'success' : r.error || 'failed',
        sessionId: String(r.sessionId || ''),
        createdAt: r.createdAt,
      })),
      ...calcPagination(total, page, pageSize),
    };
  }

  // ============ 安装 / 卸载 ============

  /** 安装/下载 Agent（幂等，返回安装目录） */
  async install(agentId: number, userId: number, version?: string) {
    await this.findPublished(agentId);
    const installDir = 'agents/' + agentId;
    const exists = await this.installRepo.findOne({
      where: { userId, agentId },
    });
    if (!exists) {
      await this.installRepo.save(
        this.installRepo.create({
          userId,
          agentId,
          version,
          installDir,
        }),
      );
      await this.agentRepo.increment({ id: agentId }, 'downloadCount', 1);
    }
    return { installDir };
  }

  /** 已安装 Agent 列表 */
  async listInstalled(userId: number) {
    const records = await this.installRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const ids = records.map((r) => r.agentId);
    if (!ids.length) return [];
    const agents = await this.publishedAgentsByIds(ids);
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const creatorNames = await this.batchCreatorNames(agents);

    return records
      .filter((r) => agentMap.has(r.agentId))
      .map((r) => {
        const agent = agentMap.get(r.agentId)!;
        return this.toMarketAgent(
          agent,
          creatorNames.get(agent.creatorId),
          false,
        );
      });
  }

  /** 卸载 Agent */
  async uninstall(agentId: number, userId: number): Promise<void> {
    const exists = await this.installRepo.findOne({
      where: { userId, agentId },
    });
    if (!exists) {
      throw new NotFoundException('未安装该 Agent');
    }
    await this.installRepo.delete(exists.id);
  }

  // ============ 创作者 ============

  /** 我的 Agent 列表 */
  async listCreator(
    userId: number,
    page: number,
    pageSize: number,
    status?: string,
  ): Promise<PaginatedResult<unknown>> {
    const qb = this.agentRepo
      .createQueryBuilder('a')
      .where('a.creator_id = :userId', { userId })
      .orderBy('a.created_at', 'DESC');
    if (status) {
      qb.andWhere('a.status = :status', { status });
    }
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [agents, total] = await qb.getManyAndCount();
    const modelMap = await this.loadModelMap(agents);

    return {
      list: agents.map((a) => this.toCreatorAgent(a, modelMap)),
      ...calcPagination(total, page, pageSize),
    };
  }

  /** 创建 Agent（默认 draft） */
  async createCreator(userId: number, dto: CreateAgentDto) {
    await this.ensureModelExists(dto.modelId);
    const agent = this.agentRepo.create({
      name: dto.name,
      displayName: dto.displayName,
      description: dto.description,
      avatar: dto.avatar,
      category: dto.category,
      systemPrompt: dto.systemPrompt,
      usageExample: this.serializeUsageExamples(dto.usageExamples),
      modelId: String(dto.modelId),
      pricePerCall:
        dto.pricingMode === 'per_call' ? dto.pricePerCall || 0 : 0,
      pricePerToken:
        dto.pricingMode === 'per_token'
          ? {
              input: dto.pricePerTokenInput || 0,
              output: dto.pricePerTokenOutput || 0,
            }
          : undefined,
      creatorId: userId,
      creatorType: 'user',
      status: 'draft',
      tags: [],
      userId,
      sourceType: 'user',
      runtimeType: 'openclaw',
      isOfficial: false,
      officialVisible: true,
      syncStatus: 'pending',
      pricingStrategy: dto.pricingMode === 'per_call' ? 'fixed' : 'model',
      version: 1,
    });
    const saved = await this.agentRepo.save(agent);
    const modelMap = await this.loadModelMap([saved]);
    return this.toCreatorAgent(saved, modelMap);
  }

  /** 我的 Agent 详情（非本人 404） */
  async getCreatorDetail(userId: number, id: number) {
    const agent = await this.agentRepo.findOne({
      where: { id, creatorId: userId },
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }
    const modelMap = await this.loadModelMap([agent]);
    return this.toCreatorAgent(agent, modelMap);
  }

  /** 更新我的 Agent（仅本人） */
  async updateCreator(userId: number, id: number, dto: UpdateAgentDto) {
    const agent = await this.agentRepo.findOne({
      where: { id, creatorId: userId },
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }
    if (dto.modelId !== undefined) {
      await this.ensureModelExists(dto.modelId);
    }

    if (dto.name !== undefined) agent.name = dto.name;
    if (dto.displayName !== undefined) agent.displayName = dto.displayName;
    if (dto.description !== undefined) agent.description = dto.description;
    if (dto.avatar !== undefined) agent.avatar = dto.avatar;
    if (dto.category !== undefined) agent.category = dto.category;
    if (dto.systemPrompt !== undefined) agent.systemPrompt = dto.systemPrompt;
    if (dto.usageExamples !== undefined) {
      agent.usageExample = this.serializeUsageExamples(dto.usageExamples);
    }
    if (dto.modelId !== undefined) agent.modelId = String(dto.modelId);

    if (dto.pricingMode !== undefined) {
      agent.pricingStrategy =
        dto.pricingMode === 'per_call' ? 'fixed' : 'model';
      agent.pricePerCall =
        dto.pricingMode === 'per_call'
          ? dto.pricePerCall ?? agent.pricePerCall
          : 0;
      agent.pricePerToken =
        dto.pricingMode === 'per_token'
          ? {
              input: dto.pricePerTokenInput ?? agent.pricePerToken?.input ?? 0,
              output:
                dto.pricePerTokenOutput ?? agent.pricePerToken?.output ?? 0,
            }
          : undefined;
    } else {
      if (dto.pricePerCall !== undefined) {
        agent.pricePerCall = dto.pricePerCall;
      }
      if (
        dto.pricePerTokenInput !== undefined ||
        dto.pricePerTokenOutput !== undefined
      ) {
        agent.pricePerToken = {
          input: dto.pricePerTokenInput ?? agent.pricePerToken?.input ?? 0,
          output: dto.pricePerTokenOutput ?? agent.pricePerToken?.output ?? 0,
        };
      }
    }

    await this.agentRepo.save(agent);
    const modelMap = await this.loadModelMap([agent]);
    return this.toCreatorAgent(agent, modelMap);
  }

  /** 删除我的 Agent（仅 draft 可删，非本人 404） */
  async deleteCreator(userId: number, id: number): Promise<void> {
    const agent = await this.agentRepo.findOne({
      where: { id, creatorId: userId },
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }
    if (agent.status !== 'draft') {
      throw new BadRequestException('仅草稿状态的 Agent 可删除');
    }
    await this.agentRepo.delete(id);
  }

  /** 提交审核（状态 → pending_review） */
  async submitCreator(userId: number, id: number) {
    const agent = await this.agentRepo.findOne({
      where: { id, creatorId: userId },
    });
    if (!agent) {
      throw new NotFoundException('Agent 不存在');
    }
    if (agent.status === 'pending_review') {
      throw new BadRequestException('Agent 正在审核中，请勿重复提交');
    }
    if (agent.status === 'published') {
      throw new BadRequestException('Agent 已上架，无需重复提交');
    }
    await this.agentRepo
      .createQueryBuilder()
      .update(AgentEntity)
      .set({ status: 'pending_review', rejectionReason: null as unknown as string })
      .where('id = :id', { id })
      .execute();
    const updated = await this.agentRepo.findOne({ where: { id } });
    const modelMap = await this.loadModelMap([updated!]);
    return this.toCreatorAgent(updated!, modelMap);
  }

  // ============ 收益 / 提现 ============

  /** 收益汇总（基于 agent_call_logs 统计当前用户创建的 Agent 收益） */
  async getRevenueSummary(userId: number) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const start30 = new Date(now);
    start30.setDate(start30.getDate() - 29);
    start30.setHours(0, 0, 0, 0);

    const totalRow = await this.callLogRepo
      .createQueryBuilder('cl')
      .innerJoin('agents', 'a', 'a.id = cl.agent_id')
      .select('COALESCE(SUM(cl.credits_cost), 0)', 'revenue')
      .addSelect('COUNT(*)', 'calls')
      .where('a.creator_id = :userId', { userId })
      .getRawOne();

    const monthRow = await this.callLogRepo
      .createQueryBuilder('cl')
      .innerJoin('agents', 'a', 'a.id = cl.agent_id')
      .select('COALESCE(SUM(cl.credits_cost), 0)', 'revenue')
      .where('a.creator_id = :userId', { userId })
      .andWhere('cl.created_at >= :monthStart', { monthStart })
      .getRawOne();

    const dailyRows = await this.callLogRepo
      .createQueryBuilder('cl')
      .innerJoin('agents', 'a', 'a.id = cl.agent_id')
      .select("DATE_FORMAT(cl.created_at, '%Y-%m-%d')", 'date')
      .addSelect('COALESCE(SUM(cl.credits_cost), 0)', 'revenue')
      .addSelect('COUNT(*)', 'calls')
      .where('a.creator_id = :userId', { userId })
      .andWhere('cl.created_at >= :start30', { start30 })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    const withdrawnRow = await this.withdrawalRepo
      .createQueryBuilder('w')
      .select('COALESCE(SUM(w.amount), 0)', 'amount')
      .where('w.user_id = :userId', { userId })
      .andWhere('w.status IN (:...statuses)', {
        statuses: REVIEW_STATUSES,
      })
      .getRawOne();

    const totalRevenue = Number(totalRow?.revenue || 0);
    const totalCalls = Number(totalRow?.calls || 0);
    const withdrawn = Number(withdrawnRow?.amount || 0);

    return {
      totalRevenue,
      monthRevenue: Number(monthRow?.revenue || 0),
      totalCalls,
      dailyRevenue: (dailyRows || []).map((d) => ({
        date: d.date,
        revenue: Number(d.revenue),
        calls: Number(d.calls),
      })),
      availableBalance: Math.max(0, totalRevenue - withdrawn),
    };
  }

  /** 提现记录（分页） */
  async listWithdrawals(
    userId: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<unknown>> {
    const [records, total] = await this.withdrawalRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      list: records.map((r) => this.toWithdrawalRecord(r)),
      ...calcPagination(total, page, pageSize),
    };
  }

  /** 申请提现（amount > 0，余额校验） */
  async requestWithdrawal(userId: number, amount: number) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('提现金额必须大于 0');
    }
    const summary = await this.getRevenueSummary(userId);
    if (value > summary.availableBalance) {
      throw new BadRequestException('可提现余额不足');
    }
    const record = this.withdrawalRepo.create({
      userId,
      amount: value,
      status: 'pending',
      channel: 'wechat',
    });
    const saved = await this.withdrawalRepo.save(record);
    return this.toWithdrawalRecord(saved);
  }

  // ============ 原有接口 ============

  async listPublished(query: {
    page: number;
    pageSize: number;
    category?: string;
    keyword?: string;
    sort?: string;
  }) {
    const { page, pageSize, category, keyword, sort } = query;
    const qb = this.agentRepo.createQueryBuilder('a');
    qb.where('a.status = :status', { status: 'published' });
    qb.andWhere('a.official_visible = :visible', { visible: true });

    if (category) {
      qb.andWhere('a.category = :category', { category });
    }
    if (keyword) {
      qb.andWhere('(a.name LIKE :kw OR a.display_name LIKE :kw OR a.description LIKE :kw)', {
        kw: '%' + keyword + '%',
      });
    }

    switch (sort) {
      case 'popular':
        qb.orderBy('a.call_count', 'DESC');
        break;
      case 'rating':
        qb.orderBy('a.rating', 'DESC');
        break;
      default:
        qb.orderBy('a.published_at', 'DESC');
        break;
    }

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [agents, total] = await qb.getManyAndCount();

    return {
      list: agents.map((a) => this.toListItem(a)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listCategories() {
    const rows = await this.agentRepo
      .createQueryBuilder('a')
      .select('a.category', 'category')
      .addSelect('COUNT(*)', 'cnt')
      .where('a.status = :status', { status: 'published' })
      .andWhere('a.official_visible = :visible', { visible: true })
      .groupBy('a.category')
      .getRawMany<{ category: string; cnt: string }>();

    return rows.map((r) => ({
      category: r.category,
      displayName: DISPLAY_NAMES[r.category] || r.category,
      agentCount: Number(r.cnt),
    }));
  }

  async getDetail(id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) return null;
    return this.toDetail(agent);
  }

  private toListItem(a: AgentEntity) {
    const zh = AGENT_ZH_MAP[a.name] || AGENT_ZH_MAP[a.displayName || ''];
    return {
      id: a.id,
      name: a.name,
      displayName: zh?.displayName || a.displayName || a.name,
      description: zh?.description || a.description || '',
      avatar: a.avatar,
      category: a.category,
      tags: a.tags || [],
      modelId: a.modelId,
      pricePerCall: a.pricePerCall,
      rating: Number(a.rating) || 0,
      ratingCount: a.ratingCount,
      callCount: a.callCount,
      isOfficial: a.isOfficial,
      sourceCategory: a.sourceCategory,
    };
  }

  private toDetail(agent: AgentEntity) {
    return {
      id: agent.id,
      name: agent.name,
      displayName: agent.displayName || agent.name,
      description: agent.description || '',
      avatar: agent.avatar,
      systemPrompt: agent.systemPrompt,
      usageExample: agent.usageExample,
      category: agent.category,
      tags: agent.tags || [],
      modelId: agent.modelId,
      pricePerCall: agent.pricePerCall,
      rating: Number(agent.rating) || 0,
      ratingCount: agent.ratingCount,
      callCount: agent.callCount,
      isOfficial: agent.isOfficial,
      sourceCategory: agent.sourceCategory,
      sourceName: agent.sourceName,
      createdAt: agent.createdAt?.toISOString(),
      publishedAt: agent.publishedAt?.toISOString(),
    };
  }

  // ============ 内部辅助 ============

  private async findPublished(id: number): Promise<AgentEntity> {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent || agent.status !== 'published' || !agent.officialVisible) {
      throw new NotFoundException('Agent 不存在或未上架');
    }
    return agent;
  }

  private async publishedAgentsByIds(ids: number[]): Promise<AgentEntity[]> {
    return this.agentRepo
      .createQueryBuilder('a')
      .where('a.id IN (:...ids)', { ids })
      .andWhere('a.status = :status', { status: 'published' })
      .andWhere('a.official_visible = :visible', { visible: true })
      .getMany();
  }

  private async findCreatorName(creatorId: number): Promise<string | undefined> {
    if (!creatorId) return undefined;
    const rows = (await this.agentRepo.manager.query(
      'SELECT username FROM users WHERE id = ? LIMIT 1',
      [creatorId],
    )) as Array<{ username: string }>;
    return rows.length ? rows[0].username : undefined;
  }

  private async batchCreatorNames(
    agents: AgentEntity[],
  ): Promise<Map<number, string>> {
    const ids = [
      ...new Set(
        agents
          .map((a) => a.creatorId)
          .filter((v): v is number => Number.isFinite(v) && v > 0),
      ),
    ];
    if (!ids.length) return new Map();
    const rows = (await this.agentRepo.manager.query(
      'SELECT id, username FROM users WHERE id IN (?)',
      [ids],
    )) as Array<{ id: string; username: string }>;
    return new Map(rows.map((r) => [Number(r.id), r.username]));
  }

  private async recalcAgentRating(agentId: number): Promise<void> {
    const row = await this.ratingRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.agent_id = :agentId', { agentId })
      .getRawOne();
    const avg = row && row.avg !== null ? Number(row.avg) : 0;
    const cnt = row ? Number(row.cnt) : 0;
    await this.agentRepo.update(agentId, {
      rating: Math.round(avg * 100) / 100,
      ratingCount: cnt,
    });
  }

  private toMarketAgent(
    a: AgentEntity,
    creatorName?: string,
    isFavorited = false,
  ) {
    const zh = AGENT_ZH_MAP[a.name] || AGENT_ZH_MAP[a.displayName || ''];
    return {
      id: a.id,
      name: a.name,
      displayName: zh?.displayName || a.displayName || a.name,
      description: zh?.description || a.description || '',
      avatar: a.avatar,
      category: a.category,
      tags: a.tags || [],
      rating: Number(a.rating) || 0,
      ratingCount: a.ratingCount,
      callCount: a.callCount,
      pricePerCall: a.pricePerCall,
      pricePerToken: a.pricePerToken || { input: 0, output: 0 },
      creatorType: a.creatorType,
      creatorName,
      usageExample: this.usageExampleText(a),
      isOfficial: a.isOfficial,
      isFavorited,
    };
  }

  private toTokenUsage(raw: unknown): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    const value =
      raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : undefined;
    const input = value && value.input ? Number(value.input) : 0;
    const output = value && value.output ? Number(value.output) : 0;
    const total = value && value.total ? Number(value.total) : 0;
    return {
      promptTokens: input,
      completionTokens: output,
      totalTokens: total || input + output,
    };
  }

  private serializeUsageExamples(usageExamples?: string[]): string | undefined {
    if (!usageExamples || !usageExamples.length) return undefined;
    return JSON.stringify(usageExamples);
  }

  private parseUsageExamples(a: AgentEntity): string[] {
    if (!a.usageExample) return [];
    try {
      const parsed = JSON.parse(a.usageExample);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
      return [a.usageExample];
    } catch {
      return [a.usageExample];
    }
  }

  private usageExampleText(a: AgentEntity): string {
    return this.parseUsageExamples(a).join('\n');
  }

  private normalizeModelId(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private async ensureModelExists(modelId: number): Promise<void> {
    const exists = await this.modelService.existsActive(modelId);
    if (!exists) {
      throw new BadRequestException('模型不存在或未启用');
    }
  }

  private async loadModelMap(
    agents: AgentEntity[],
  ): Promise<Map<number, ModelOption>> {
    const ids = [
      ...new Set(
        agents
          .map((a) => this.normalizeModelId(a.modelId))
          .filter((n) => n > 0),
      ),
    ];
    if (!ids.length) return new Map();
    const models = await this.modelService.findByIds(ids);
    return new Map(
      models.map((m) => [m.id, { id: m.id, name: m.name, provider: m.provider }]),
    );
  }

  private toCreatorAgent(
    a: AgentEntity,
    modelMap: Map<number, ModelOption>,
  ) {
    const modelId = this.normalizeModelId(a.modelId);
    return {
      id: a.id,
      name: a.name,
      displayName: a.displayName || a.name,
      description: a.description || '',
      avatar: a.avatar,
      category: a.category,
      systemPrompt: a.systemPrompt,
      usageExamples: this.parseUsageExamples(a),
      modelId,
      modelName: modelMap.get(modelId)?.name,
      pricingMode: a.pricingStrategy === 'fixed' ? 'per_call' : 'per_token',
      pricePerCall: a.pricePerCall || 0,
      pricePerTokenInput: a.pricePerToken?.input ?? 0,
      pricePerTokenOutput: a.pricePerToken?.output ?? 0,
      status: a.status,
      rejectReason: a.rejectionReason,
      callCount: a.callCount,
      rating: Number(a.rating) || 0,
      ratingCount: a.ratingCount,
      createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : undefined,
      updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : undefined,
    };
  }

  private toWithdrawalRecord(r: WithdrawalRecordEntity) {
    return {
      id: r.id,
      amount: Number(r.amount),
      status: r.status === 'paid' ? 'completed' : r.status,
      remark: r.rejectedReason || undefined,
      createdAt: r.createdAt
        ? new Date(r.createdAt).toISOString()
        : new Date().toISOString(),
      processedAt: r.paidAt ? new Date(r.paidAt).toISOString() : undefined,
    };
  }
}
