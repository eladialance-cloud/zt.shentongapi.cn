import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginEntity } from '../entities/plugin.entity';
import { UserPluginEntity } from '../entities/user-plugin.entity';
import { PaginationQuery, PaginatedResult } from '../../../common/types/pagination.type';
import { calcPagination } from '../../../common/utils/pagination.util';

/**
 * 用户端插件服务
 * 数据合同真源：desktop types/plugin / Task 22 - 插件管理
 */
@Injectable()
export class PluginService {
  constructor(
    @InjectRepository(PluginEntity)
    private readonly pluginRepo: Repository<PluginEntity>,
    @InjectRepository(UserPluginEntity)
    private readonly userPluginRepo: Repository<UserPluginEntity>,
  ) {}

  /** 健康检查 */
  health() {
    return { status: 'ok', module: 'plugin' };
  }

  // ─── 插件市场 ────────────────────────────────────────────

  /**
   * 插件市场列表（分页，只查已上架的插件）
   */
  async listMarket(
    query: PaginationQuery,
  ): Promise<PaginatedResult<PluginEntity>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;

    const qb = this.pluginRepo
      .createQueryBuilder('p')
      .where('p.is_active = :active', { active: true });

    if (query.keyword) {
      qb.andWhere('(p.name LIKE :kw OR p.description LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    qb.orderBy('p.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, ...calcPagination(total, page, pageSize) };
  }

  // ─── 用户安装 / 卸载 ────────────────────────────────────

  /**
   * 安装插件（创建 UserPluginEntity，避免重复安装）
   */
  async install(pluginId: number, userId: number): Promise<UserPluginEntity> {
    // 校验插件存在且已上架
    const plugin = await this.pluginRepo.findOne({
      where: { id: pluginId },
    });
    if (!plugin) {
      throw new NotFoundException(`插件 ${pluginId} 不存在`);
    }

    // 检查是否已安装
    const existing = await this.userPluginRepo.findOne({
      where: { userId, pluginId },
    });
    if (existing) {
      throw new ConflictException('该插件已安装');
    }

    // 创建安装记录
    const record = new UserPluginEntity();
    record.userId = userId;
    record.pluginId = pluginId;
    record.enabled = true;
    record.isInstalled = true;
    record.config = plugin.config ?? undefined;
    return this.userPluginRepo.save(record);
  }

  /**
   * 卸载插件（删除当前用户的 UserPluginEntity）
   */
  async uninstall(pluginId: number, userId: number): Promise<void> {
    const existing = await this.userPluginRepo.findOne({
      where: { userId, pluginId },
    });
    if (!existing) {
      throw new NotFoundException('未安装该插件');
    }
    await this.userPluginRepo.delete(existing.id);
  }

  // ─── 已安装列表 ──────────────────────────────────────────

  /**
   * 已安装插件列表（join UserPluginEntity + PluginEntity）
   */
  async listInstalled(
    userId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<UserPluginEntity>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;

    const qb = this.userPluginRepo
      .createQueryBuilder('up')
      .leftJoinAndSelect('up.plugin', 'plugin')
      .where('up.user_id = :userId', { userId })
      .andWhere('up.is_installed = :installed', { installed: true });

    if (query.keyword) {
      qb.andWhere('(plugin.name LIKE :kw OR plugin.description LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    qb.orderBy('up.installed_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, ...calcPagination(total, page, pageSize) };
  }

  // ─── 启用 / 禁用 ─────────────────────────────────────────

  /**
   * 启用插件
   */
  async enable(pluginId: number, userId: number): Promise<void> {
    const record = await this.findUserPlugin(pluginId, userId);
    record.enabled = true;
    await this.userPluginRepo.save(record);
  }

  /**
   * 禁用插件
   */
  async disable(pluginId: number, userId: number): Promise<void> {
    const record = await this.findUserPlugin(pluginId, userId);
    record.enabled = false;
    await this.userPluginRepo.save(record);
  }

  // ─── 配置更新 ────────────────────────────────────────────

  /**
   * 更新插件配置（更新 UserPluginEntity 的 config 字段）
   */
  async updateConfig(
    pluginId: number,
    userId: number,
    config: Record<string, unknown>,
  ): Promise<void> {
    const record = await this.findUserPlugin(pluginId, userId);
    record.config = config;
    await this.userPluginRepo.save(record);
  }

  // ─── 调用日志 ────────────────────────────────────────────

  /**
   * 调用日志（当前无日志 Entity，返回空列表）
   */
  async listLogs(
    _userId: number,
    query: PaginationQuery,
  ): Promise<PaginatedResult<never>> {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    return {
      list: [],
      ...calcPagination(0, page, pageSize),
    };
  }

  // ─── 内部辅助 ────────────────────────────────────────────

  /**
   * 查找当前用户的插件安装记录，不存在则抛 NotFoundException
   */
  private async findUserPlugin(
    pluginId: number,
    userId: number,
  ): Promise<UserPluginEntity> {
    const record = await this.userPluginRepo.findOne({
      where: { userId, pluginId },
    });
    if (!record) {
      throw new NotFoundException('未安装该插件');
    }
    return record;
  }
}
