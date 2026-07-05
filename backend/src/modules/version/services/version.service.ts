import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientVersionEntity, ClientPlatform } from '../entities/client-version.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

export interface CheckUpdateResult {
  hasUpdate: boolean;
  latestVersion: string | null;
  forceUpdate: boolean;
  grayscaleHit: boolean;
  downloadUrl: string | null;
  changelog: string | null;
}

/**
 * 客户端版本服务
 * 数据合同真源：Task 27 - 客户端版本管理
 */
@Injectable()
export class VersionService {
  constructor(
    @InjectRepository(ClientVersionEntity)
    private versionRepo: Repository<ClientVersionEntity>,
  ) {}

  /** 检查更新 */
  async checkUpdate(
    platform: ClientPlatform,
    currentVersion: string,
  ): Promise<CheckUpdateResult> {
    const latest = await this.getLatest(platform);
    if (!latest) {
      return {
        hasUpdate: false,
        latestVersion: null,
        forceUpdate: false,
        grayscaleHit: false,
        downloadUrl: null,
        changelog: null,
      };
    }
    const hasUpdate = this.compareVersion(currentVersion, latest.version) < 0;
    const grayscaleHit = this.isGrayscaleHit(latest.grayscalePercent);
    return {
      hasUpdate,
      latestVersion: latest.version,
      forceUpdate: latest.forceUpdate && hasUpdate,
      grayscaleHit,
      downloadUrl: latest.downloadUrl,
      changelog: latest.changelog || null,
    };
  }

  /** 获取最新版本（按 publishedAt DESC） */
  async getLatest(platform: ClientPlatform): Promise<ClientVersionEntity | null> {
    return this.versionRepo
      .createQueryBuilder('v')
      .where('v.platform = :platform', { platform })
      .andWhere('v.is_active = :active', { active: true })
      .orderBy('v.published_at', 'DESC')
      .addOrderBy('v.createdAt', 'DESC')
      .getOne();
  }

  /** 版本统计（mock） */
  async getStats(versionId: number): Promise<{
    versionId: number;
    installCount: number;
    activeCount: number;
  }> {
    const version = await this.versionRepo.findOne({ where: { id: versionId } });
    if (!version) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '版本不存在');
    }
    // mock 统计（真实场景从埋点表聚合）
    return {
      versionId,
      installCount: 0,
      activeCount: 0,
    };
  }

  // ============ CRUD ============

  async list(platform?: string): Promise<ClientVersionEntity[]> {
    const qb = this.versionRepo.createQueryBuilder('v');
    if (platform) {
      qb.andWhere('v.platform = :platform', { platform });
    }
    qb.orderBy('v.publishedAt', 'DESC').addOrderBy('v.createdAt', 'DESC');
    return qb.getMany();
  }

  async get(id: number): Promise<ClientVersionEntity> {
    const version = await this.versionRepo.findOne({ where: { id } });
    if (!version) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '版本不存在');
    }
    return version;
  }

  async create(data: Partial<ClientVersionEntity>): Promise<ClientVersionEntity> {
    const entity = this.versionRepo.create({
      version: data.version,
      platform: data.platform,
      downloadUrl: data.downloadUrl,
      changelog: data.changelog,
      forceUpdate: data.forceUpdate ?? false,
      grayscalePercent: data.grayscalePercent ?? 100,
      publishedAt: data.publishedAt || new Date(),
      isActive: data.isActive ?? true,
    });
    return this.versionRepo.save(entity);
  }

  async update(
    id: number,
    data: Partial<ClientVersionEntity>,
  ): Promise<ClientVersionEntity> {
    const version = await this.versionRepo.findOne({ where: { id } });
    if (!version) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '版本不存在');
    }
    const patch: Partial<ClientVersionEntity> = {};
    if (data.version !== undefined) patch.version = data.version;
    if (data.platform !== undefined) patch.platform = data.platform;
    if (data.downloadUrl !== undefined) patch.downloadUrl = data.downloadUrl;
    if (data.changelog !== undefined) patch.changelog = data.changelog;
    if (data.forceUpdate !== undefined) patch.forceUpdate = data.forceUpdate;
    if (data.grayscalePercent !== undefined) patch.grayscalePercent = data.grayscalePercent;
    if (data.publishedAt !== undefined) patch.publishedAt = data.publishedAt;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    await this.versionRepo.update(id, patch);
    return this.get(id);
  }

  async delete(id: number): Promise<void> {
    const version = await this.versionRepo.findOne({ where: { id } });
    if (!version) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '版本不存在');
    }
    await this.versionRepo.delete(id);
  }

  /** 健康检查 */
  health() {
    return { status: 'ok', module: 'version' };
  }

  // ============ 内部工具 ============

  /** 语义版本比较：a < b 返回 -1，相等 0，a > b 返回 1 */
  private compareVersion(a: string, b: string): number {
    const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
    const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na < nb) return -1;
      if (na > nb) return 1;
    }
    return 0;
  }

  /** 灰度命中判断：随机数 < grayscalePercent 即命中 */
  private isGrayscaleHit(grayscalePercent: number): boolean {
    if (grayscalePercent >= 100) return true;
    if (grayscalePercent <= 0) return false;
    return Math.floor(Math.random() * 100) < grayscalePercent;
  }
}
