import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigEntity } from './entities/system-config.entity';
import { AnnouncementEntity } from './entities/announcement.entity';
import { TenantEntity } from './entities/tenant.entity';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { ClearCacheDto } from './dto/clear-cache.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';

/** 各分区默认配置（首次访问时返回） */
const DEFAULT_SECTION_CONFIG: Record<string, Record<string, unknown>> = {
  cache: {
    l1Ttl: 60,
    l2Ttl: 300,
    l3Ttl: 3600,
  },
  rate_limit: {
    dailyCallLimitByLevel: { 1: 100, 2: 500, 3: 2000, 4: 10000, 5: 50000 },
    concurrencyLimit: 10,
    monthlyCreditsLimitByLevel: {
      1: 10000,
      2: 50000,
      3: 200000,
      4: 1000000,
      5: 5000000,
    },
  },
  notification: {
    smtp: {
      host: '',
      port: 465,
      username: '',
      from: '',
      enabled: false,
    },
    sms: {
      provider: '',
      accessKeyId: '',
      signName: '',
      enabled: false,
    },
    push: {
      appId: '',
      enabled: false,
    },
  },
};

/**
 * 管理端系统配置服务
 * 数据合同真源：Task 28 - 系统配置 / frontend admin-system-api.ts
 *
 * 提供：
 *   - 系统配置（system_config 表，按 section 分区）读写
 *   - 缓存清理（占位实现，记录日志）
 *   - 租户（tenants 表）CRUD 与停用/恢复
 *   - 公告（announcements 表）CRUD 与发布/撤回
 */
@Injectable()
export class AdminSystemService {
  constructor(
    @InjectRepository(SystemConfigEntity)
    private readonly configRepo: Repository<SystemConfigEntity>,
    @InjectRepository(AnnouncementEntity)
    private readonly announcementRepo: Repository<AnnouncementEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  // ============ 系统配置 ============

  /** 获取系统配置（按分区） */
  async getSystemConfig(section: string): Promise<Record<string, unknown>> {
    const row = await this.configRepo.findOne({ where: { section } });
    if (!row) {
      return { ...(DEFAULT_SECTION_CONFIG[section] || {}) };
    }
    return { ...(DEFAULT_SECTION_CONFIG[section] || {}), ...row.configValue };
  }

  /** 更新系统配置 */
  async updateSystemConfig(dto: UpdateSystemConfigDto): Promise<void> {
    const existing = await this.configRepo.findOne({
      where: { section: dto.section },
    });
    const base = existing
      ? { ...existing.configValue }
      : { ...(DEFAULT_SECTION_CONFIG[dto.section] || {}) };
    const merged = { ...base, ...dto.config };
    if (existing) {
      existing.configValue = merged;
      await this.configRepo.save(existing);
    } else {
      const created = this.configRepo.create({
        section: dto.section,
        configValue: merged,
      });
      await this.configRepo.save(created);
    }
  }

  /** 清空缓存（占位实现，统一返回成功） */
  async clearCache(dto: ClearCacheDto): Promise<void> {
    // 当前未接入具体缓存中间件，按层级记录意图即可
    // 实际清理由 CacheModule / Redis 完成时再补充
    void dto;
  }

  // ============ 租户 ============

  /** 租户列表（分页） */
  async listTenants(query: TenantQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const [rows, total] = await this.tenantRepo
      .createQueryBuilder('t')
      .orderBy('t.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      list: rows.map((r) => this.toTenant(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 新增租户 */
  async createTenant(dto: CreateTenantDto) {
    const entity = this.tenantRepo.create({
      name: dto.name,
      quota: {
        users: dto.quota.users,
        calls: dto.quota.calls,
        storage: dto.quota.storage,
      },
      status: 'active',
    });
    const saved = await this.tenantRepo.save(entity);
    return this.toTenant(saved);
  }

  /** 更新租户 */
  async updateTenant(id: number, dto: UpdateTenantDto): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`租户 ${id} 不存在`);
    }
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.quota !== undefined) {
      tenant.quota = {
        users: dto.quota.users,
        calls: dto.quota.calls,
        storage: dto.quota.storage,
      };
    }
    await this.tenantRepo.save(tenant);
  }

  /** 停用/恢复租户（状态切换） */
  async suspendTenant(id: number): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`租户 ${id} 不存在`);
    }
    tenant.status = tenant.status === 'active' ? 'suspended' : 'active';
    await this.tenantRepo.save(tenant);
  }

  // ============ 公告 ============

  /** 公告列表（分页） */
  async listAnnouncements(query: AnnouncementQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const qb = this.announcementRepo.createQueryBuilder('a');
    if (query.status) {
      qb.andWhere('a.status = :status', { status: query.status });
    }
    qb.orderBy('a.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return {
      list: rows.map((r) => this.toAnnouncement(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 新增公告 */
  async createAnnouncement(dto: CreateAnnouncementDto) {
    const entity = this.announcementRepo.create({
      title: dto.title,
      content: dto.content,
      type: dto.type,
      scope: dto.scope,
      targetLevel: dto.targetLevel,
      isActive: dto.isActive,
      status: 'draft',
    });
    const saved = await this.announcementRepo.save(entity);
    return this.toAnnouncement(saved);
  }

  /** 更新公告 */
  async updateAnnouncement(
    id: number,
    dto: UpdateAnnouncementDto,
  ): Promise<void> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) {
      throw new NotFoundException(`公告 ${id} 不存在`);
    }
    if (dto.title !== undefined) announcement.title = dto.title;
    if (dto.content !== undefined) announcement.content = dto.content;
    if (dto.type !== undefined) announcement.type = dto.type;
    if (dto.scope !== undefined) announcement.scope = dto.scope;
    if (dto.targetLevel !== undefined)
      announcement.targetLevel = dto.targetLevel;
    if (dto.isActive !== undefined) announcement.isActive = dto.isActive;
    await this.announcementRepo.save(announcement);
  }

  /** 发布公告 */
  async publishAnnouncement(id: number): Promise<void> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) {
      throw new NotFoundException(`公告 ${id} 不存在`);
    }
    announcement.status = 'published';
    announcement.publishedAt = new Date();
    await this.announcementRepo.save(announcement);
  }

  /** 撤回公告 */
  async unpublishAnnouncement(id: number): Promise<void> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) {
      throw new NotFoundException(`公告 ${id} 不存在`);
    }
    announcement.status = 'draft';
    await this.announcementRepo.save(announcement);
  }

  /** 删除公告 */
  async deleteAnnouncement(id: number): Promise<void> {
    const announcement = await this.announcementRepo.findOne({ where: { id } });
    if (!announcement) {
      throw new NotFoundException(`公告 ${id} 不存在`);
    }
    await this.announcementRepo.remove(announcement);
  }

  // ============ 映射 ============

  private toTenant(r: TenantEntity) {
    return {
      id: r.id,
      name: r.name,
      quota: r.quota,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private toAnnouncement(r: AnnouncementEntity) {
    return {
      id: r.id,
      title: r.title,
      content: r.content,
      type: r.type,
      scope: r.scope,
      targetLevel: r.targetLevel,
      isActive: r.isActive,
      status: r.status,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
