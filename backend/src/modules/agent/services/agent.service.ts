import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentEntity } from '../entities/agent.entity';

const DISPLAY_NAMES: Record<string, string> = {
  office: '办公',
  programming: '编程',
  copywriting: '文案',
  data_analysis: '数据分析',
  other: '其他',
};

@Injectable()
export class AgentService {
  constructor(
    @InjectRepository(AgentEntity)
    private readonly agentRepo: Repository<AgentEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'agent' };
  }

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
      qb.andWhere('(a.name LIKE :kw OR a.description LIKE :kw)', { kw: `%${keyword}%` });
    }

    switch (sort) {
      case 'popular': qb.orderBy('a.call_count', 'DESC'); break;
      case 'rating': qb.orderBy('a.rating', 'DESC'); break;
      default: qb.orderBy('a.published_at', 'DESC'); break;
    }

    qb.skip((page - 1) * pageSize).take(pageSize);
    const [agents, total] = await qb.getManyAndCount();

    return {
      list: agents.map(a => this.toListItem(a)),
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

    return rows.map(r => ({
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
    return {
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
    };
  }

  private toDetail(agent: AgentEntity) {
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