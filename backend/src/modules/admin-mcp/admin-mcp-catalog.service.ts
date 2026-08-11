import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpCatalogEntity } from './entities/mcp-catalog.entity';
import {
  CreateMcpCatalogDto,
  McpCatalogQueryDto,
  UpdateMcpCatalogDto,
} from './dto/admin-mcp-catalog.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { assertMcpCommandSafe } from '../mcp/utils/mcp-security';
import { AiClassifyService } from '../admin-classify/ai-classify.service';
import { normalizeTags, pickGitHubSourceFields } from '../../common/utils/asset-common';

/**
 * MCP 官方目录管理服务
 * 提供官方目录条目的分页查询、CRUD、启停切换与软删除能力
 */
@Injectable()
export class AdminMcpCatalogService {
  constructor(
    @InjectRepository(McpCatalogEntity)
    private readonly repo: Repository<McpCatalogEntity>,
    @Optional() private readonly aiClassify?: AiClassifyService,
  ) {}

  /** 目录列表（分页） */
  async list(query: McpCatalogQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.repo.createQueryBuilder('c');

    if (query.keyword) {
      qb.andWhere(
        '(c.name LIKE :keyword OR c.description LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }
    if (query.category) {
      qb.andWhere('c.category = :category', { category: query.category });
    }
    if (query.enabled !== undefined) {
      qb.andWhere('c.enabled = :enabled', {
        enabled: query.enabled === '1',
      });
    }

    qb.orderBy('c.sort_order', 'ASC')
      .addOrderBy('c.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /** 目录详情 */
  async get(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '目录条目不存在');
    }
    return item;
  }

  /** 创建目录条目 */
  async create(dto: CreateMcpCatalogDto) {
    if (dto.transportType === 'stdio') {
      assertMcpCommandSafe(dto.command, dto.args);
    }
    const entity = this.repo.create({
      enabled: true,
      version: '1.0.0',
      securityLevel: 'community',
      sortOrder: 0,
      toolCount: 0,
      ...dto,
      ...pickGitHubSourceFields(dto),
      tags: normalizeTags(dto.tags),
    });
    const saved = await this.repo.save(entity);
    if (!dto.category && this.aiClassify) {
      void this.aiClassify.classifyAndUpdate('mcp', saved.id);
    }
    return saved;
  }

  /** 更新目录条目 */
  async update(id: number, dto: UpdateMcpCatalogDto) {
    const item = await this.get(id);
    Object.assign(item, dto);
    const gh = pickGitHubSourceFields(dto);
    if (dto.tags !== undefined) item.tags = normalizeTags(dto.tags);
    if (dto.sourceType !== undefined) item.sourceType = gh.sourceType;
    if (dto.githubTopics !== undefined) item.githubTopics = gh.githubTopics;
    if (dto.sourceRepo !== undefined) item.sourceRepo = gh.sourceRepo;
    if (dto.sourcePath !== undefined) item.sourcePath = gh.sourcePath;
    if (dto.pricing !== undefined) item.pricing = gh.pricing;
    if (item.transportType === 'stdio') {
      assertMcpCommandSafe(item.command, item.args);
    }
    return this.repo.save(item);
  }

  /** 启停切换 */
  async toggle(id: number) {
    const item = await this.get(id);
    item.enabled = !item.enabled;
    return this.repo.save(item);
  }

  /** 删除（软删除：仅禁用并保留数据） */
  async remove(id: number) {
    const item = await this.get(id);
    item.enabled = false;
    await this.repo.save(item);
    return { ok: true };
  }
}
