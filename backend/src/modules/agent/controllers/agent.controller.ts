import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { AgentEntity } from '../entities/agent.entity';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Agent智能体')
@Controller('agents')
export class AgentController {
  constructor(
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return { status: 'ok', module: 'agent' };
  }

  @Get()
  @Public()
  @ApiOperation({ summary: '获取已上架 Agent 列表' })
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('sort') sort?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));

    const qb = this.agentRepo.createQueryBuilder('a');
    qb.where('a.status = :status', { status: 'published' });
    qb.andWhere('a.official_visible = :visible', { visible: true });

    if (category) {
      qb.andWhere('a.category = :category', { category });
    }

    if (keyword) {
      qb.andWhere(
        '(a.name LIKE :kw OR a.description LIKE :kw)',
        { kw: `%${keyword}%` },
      );
    }

    // 排序
    switch (sort) {
      case 'popular':
        qb.orderBy('a.call_count', 'DESC');
        break;
      case 'rating':
        qb.orderBy('a.rating', 'DESC');
        break;
      case 'newest':
      default:
        qb.orderBy('a.published_at', 'DESC');
        break;
    }

    qb.skip((p - 1) * ps).take(ps);

    const [agents, total] = await qb.getManyAndCount();

    return {
      list: agents.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description || '',
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
      })),
      total,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(total / ps),
    };
  }

  @Get('categories')
  @Public()
  @ApiOperation({ summary: '获取 Agent 分类列表' })
  async categories() {
    const rows = await this.agentRepo
      .createQueryBuilder('a')
      .select('a.category', 'category')
      .addSelect('COUNT(*)', 'cnt')
      .where('a.status = :status', { status: 'published' })
      .andWhere('a.official_visible = :visible', { visible: true })
      .groupBy('a.category')
      .getRawMany<{ category: string; cnt: string }>();

    const displayNames: Record<string, string> = {
      office: '办公',
      programming: '编程',
      copywriting: '文案',
      data_analysis: '数据分析',
      other: '其他',
    };

    return rows.map(r => ({
      category: r.category,
      displayName: displayNames[r.category] || r.category,
      agentCount: Number(r.cnt),
    }));
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: '获取 Agent 详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    const agent = await this.agentRepo.findOne({ where: { id } });
    if (!agent) {
      return { code: 404, message: 'Agent 不存在', data: null };
    }
    return {
      id: agent.id,
      name: agent.name,
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
}
