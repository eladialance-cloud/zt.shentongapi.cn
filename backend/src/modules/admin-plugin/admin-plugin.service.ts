import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Repository } from 'typeorm';
import { PluginEntity } from '../plugin/entities/plugin.entity';
import {
  AdminPluginQueryDto,
  AdminPluginReviewQueryDto,
  CreateAdminPluginDto,
  PluginSyncQueryDto,
  UpdateAdminPluginDto,
} from './dto/plugin.dto';
import { extractZipFile } from '../../common/utils/zip.util';

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

  /** 批量删除插件 */
  async batchDelete(ids: number[]) {
    const stats = { total: ids.length, deleted: 0, failed: 0, errors: [] as string[] };
    for (const id of ids) {
      try {
        await this.remove(id);
        stats.deleted++;
      } catch (e) {
        stats.failed++;
        stats.errors.push(`插件 ${id}: ${(e as Error).message}`);
      }
    }
    return stats;
  }

  /** 批量通过审核 */
  async batchApprove(ids: number[]) {
    const stats = { total: ids.length, approved: 0, failed: 0, errors: [] as string[] };
    for (const id of ids) {
      try {
        await this.approve(id);
        stats.approved++;
      } catch (e) {
        stats.failed++;
        stats.errors.push(`插件 ${id}: ${(e as Error).message}`);
      }
    }
    return stats;
  }

  /** 批量驳回审核 */
  async batchReject(ids: number[], reason: string) {
    const stats = { total: ids.length, rejected: 0, failed: 0, errors: [] as string[] };
    for (const id of ids) {
      try {
        await this.reject(id, reason);
        stats.rejected++;
      } catch (e) {
        stats.failed++;
        stats.errors.push(`插件 ${id}: ${(e as Error).message}`);
      }
    }
    return stats;
  }


  async importLocalZip(file: Express.Multer.File) {
    const ext = path.extname(file?.originalname || '').toLowerCase();
    if (!file?.buffer || file.buffer.length === 0 || ext !== '.zip') {
      throw new BadRequestException('请上传 .zip 压缩包');
    }
    const stamp = Date.now();
    const zipPath = path.join(os.tmpdir(), `plugin-local-${stamp}.zip`);
    const tmpDir = path.join(os.tmpdir(), `plugin-local-${stamp}`);
    await fsPromises.writeFile(zipPath, file.buffer);
    await fsPromises.mkdir(tmpDir, { recursive: true });
    try {
      extractZipFile(zipPath, tmpDir);
      const manifests = this.findManifests(tmpDir);
      if (manifests.length === 0) {
        throw new BadRequestException('压缩包内未找到 manifest.json / plugin.json 插件清单');
      }
      const stats = { total: manifests.length, imported: 0, failed: 0, errors: [] as string[] };
      for (const m of manifests) {
        try {
          const manifest = JSON.parse(fs.readFileSync(m, 'utf8'));
          const name = String(manifest.name || '').trim();
          if (!name) throw new Error('清单缺少 name 字段');
          const entity = this.repo.create({
            name,
            description: manifest.description || '',
            version: manifest.version || '1.0.0',
            mcpServerUrl: manifest.entryPoint || manifest.mcpServerUrl || manifest.entry_point || '',
            isOfficial: false,
            isActive: false,
          });
          await this.repo.save(entity);
          stats.imported++;
        } catch (e) {
          stats.failed++;
          stats.errors.push(`${path.relative(tmpDir, m)}: ${(e as Error).message}`);
        }
      }
      return {
        ...stats,
        message: `导入完成：新增 ${stats.imported}，失败 ${stats.failed}`,
      };
    } finally {
      try {
        await fsPromises.rm(zipPath, { force: true });
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // 忽略临时文件清理错误
      }
    }
  }

  /** 递归查找插件清单文件 */
  private findManifests(dir: string, depth = 0): string[] {
    if (depth > 4) return [];
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...this.findManifests(p, depth + 1));
      } else if (
        entry.isFile() &&
        (entry.name === 'manifest.json' || entry.name === 'plugin.json')
      ) {
        out.push(p);
      }
    }
    return out;
  }

  /** 上架 */
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