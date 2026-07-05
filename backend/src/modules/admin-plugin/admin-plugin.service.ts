import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginEntity } from '../plugin/entities/plugin.entity';
import {
  AdminPluginQueryDto,
  AdminPluginReviewQueryDto,
  CreateAdminPluginDto,
  PluginSyncQueryDto,
  UpdateAdminPluginDto,
} from './dto/plugin.dto';

/**
 * 管理端插件服务
 * 数据合同真源：Task 22 - 插件管理 / desktop types/admin-plugin
 *
 * 复用现有 PluginEntity（modules/plugin/entities/plugin.entity.ts）。
 * 该实体为 MCP 插件最小字段，管理端独有字段（type/pricingMode/reviewStatus 等）
 * 以默认值映射返回，review/publish 通过 isActive 代理更新 status。
 */
@Injectable()
export class AdminPluginService {
  constructor(
    @InjectRepository(PluginEntity)
    private readonly repo: Repository<PluginEntity>,
  ) {}

  /** 插件列表（分页） */
  async list(query: AdminPluginQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.repo.createQueryBuilder('p');
    if (query.status === 'published') {
      qb.andWhere('p.is_active = :active', { active: true });
    } else if (query.status === 'unpublished') {
      qb.andWhere('p.is_active = :active', { active: false });
    }
    qb.orderBy('p.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return {
      list: rows.map((r) => this.toItem(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 插件详情 */
  async detail(id: number) {
    const plugin = await this.repo.findOne({ where: { id } });
    if (!plugin) {
      throw new NotFoundException(`插件 ${id} 不存在`);
    }
    return this.toItem(plugin);
  }

  /** 新增插件 */
  async create(dto: CreateAdminPluginDto) {
    const entity = this.repo.create({
      name: dto.name,
      description: dto.description,
      version: dto.version,
      mcpServerUrl: dto.entryPoint,
      isOfficial: false,
      isActive: false,
    });
    const saved = await this.repo.save(entity);
    return this.toItem(saved);
  }

  /** 编辑插件 */
  async update(id: number, dto: UpdateAdminPluginDto) {
    const plugin = await this.repo.findOne({ where: { id } });
    if (!plugin) {
      throw new NotFoundException(`插件 ${id} 不存在`);
    }
    if (dto.name !== undefined) plugin.name = dto.name;
    if (dto.description !== undefined) plugin.description = dto.description;
    if (dto.version !== undefined) plugin.version = dto.version;
    if (dto.entryPoint !== undefined) plugin.mcpServerUrl = dto.entryPoint;
    await this.repo.save(plugin);
  }

  /** 删除插件 */
  async remove(id: number) {
    const plugin = await this.repo.findOne({ where: { id } });
    if (!plugin) {
      throw new NotFoundException(`插件 ${id} 不存在`);
    }
    await this.repo.delete(id);
  }

  /** 上架 */
  async publish(id: number) {
    const plugin = await this.repo.findOne({ where: { id } });
    if (!plugin) {
      throw new NotFoundException(`插件 ${id} 不存在`);
    }
    plugin.isActive = true;
    await this.repo.save(plugin);
  }

  /** 下架 */
  async unpublish(id: number) {
    const plugin = await this.repo.findOne({ where: { id } });
    if (!plugin) {
      throw new NotFoundException(`插件 ${id} 不存在`);
    }
    plugin.isActive = false;
    await this.repo.save(plugin);
  }

  /** 审核队列（占位：返回全部插件分页） */
  async listReview(query: AdminPluginReviewQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const [rows, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      list: rows.map((r) => this.toItem(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 通过审核（代理：置为上架） */
  async approve(id: number) {
    await this.publish(id);
  }

  /** 驳回审核（代理：置为下架） */
  async reject(id: number, _reason: string) {
    await this.unpublish(id);
  }

  /** 综合审核入口（action: approve | reject） */
  async review(
    id: number,
    action: 'approve' | 'reject',
    reason?: string,
  ) {
    if (action === 'approve') {
      await this.approve(id);
    } else {
      await this.reject(id, reason || '');
    }
  }

  /** MCP 同步状态列表（占位） */
  async listSyncStatus(query: PluginSyncQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const [rows, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      list: rows.map((r) => this.toSyncStatusItem(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 手动同步单个插件（占位实现） */
  async sync(id: number) {
    const plugin = await this.repo.findOne({ where: { id } });
    if (!plugin) {
      throw new NotFoundException(`插件 ${id} 不存在`);
    }
    return { synced: true, count: 0 };
  }

  /** 触发批量同步（占位实现） */
  async syncAll() {
    return { synced: true, count: 0 };
  }

  /** 映射为管理端插件项 */
  private toItem(p: PluginEntity) {
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      type: 'tool',
      version: p.version,
      entryPoint: p.mcpServerUrl,
      status: p.isActive ? 'published' : 'unpublished',
      reviewStatus: 'approved',
      creatorName: undefined,
      isOfficial: p.isOfficial,
      pricingMode: 'perCall',
      pricePerCall: 0,
      pricePerTokenInput: 0,
      pricePerTokenOutput: 0,
      callCount: 0,
      rejectReason: undefined,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  /** 映射为同步状态项 */
  private toSyncStatusItem(p: PluginEntity) {
    return {
      id: p.id,
      name: p.name,
      type: 'tool',
      syncStatus: 'synced',
      lastSyncedAt: p.updatedAt,
      errorMessage: undefined,
    };
  }
}
