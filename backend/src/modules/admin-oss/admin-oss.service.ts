import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, FindOptionsWhere } from 'typeorm';
import { SysOssConfigEntity } from './entities/sys-oss-config.entity';
import { CreateOssConfigDto, UpdateOssConfigDto, OssProvider } from './dto/admin-oss.dto';
import { FileEntity } from '../file/entities/file.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { OssUploadService } from './oss-upload.service';

/**
 * 管理端OSS配置服务
 * 提供OSS配置的增删改查、连通性测试及存储统计功能。
 * access_key / secret_key 加密存储（P0安全修复）。
 */
@Injectable()
export class AdminOssService {
  constructor(
    @InjectRepository(SysOssConfigEntity)
    private readonly ossConfigRepo: Repository<SysOssConfigEntity>,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
    private readonly encryptionService: EncryptionService,
    private readonly ossUploadService: OssUploadService,
  ) {}

  /**
   * 获取OSS配置列表（分页 + 过滤）
   * 返回 { list, total }，access_key/secret_key 脱敏
   */
  async listConfigs(query: {
    page?: number;
    pageSize?: number;
    provider?: OssProvider;
    isActive?: boolean;
  }): Promise<{ list: SysOssConfigEntity[]; total: number }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: FindOptionsWhere<SysOssConfigEntity> = {};
    if (query.provider) where.provider = query.provider;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    const [rows, total] = await this.ossConfigRepo.findAndCount({
      where,
      order: { isDefault: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: rows.map((c) => this.desensitize(c)), total };
  }

  /**
   * 获取单个OSS配置详情
   * 脱敏返回
   */
  async getConfig(id: number): Promise<SysOssConfigEntity> {
    const config = await this.ossConfigRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`OSS配置 #${id} 不存在`);
    }
    return this.desensitize(config);
  }

  /**
   * 获取OSS配置的明文密钥（仅内部服务调用，不暴露给前端）
   */
  async getDecryptedCredentials(id: number): Promise<{
    accessKey: string | undefined;
    secretKey: string | undefined;
  }> {
    const config = await this.ossConfigRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`OSS配置 #${id} 不存在`);
    }
    return {
      accessKey: config.accessKey
        ? this.encryptionService.decryptAes(config.accessKey)
        : undefined,
      secretKey: config.secretKey
        ? this.encryptionService.decryptAes(config.secretKey)
        : undefined,
    };
  }

  /**
   * 创建OSS配置
   * access_key / secret_key 加密后存储；domain 落 extra_config.cdnUrl
   */
  async createConfig(dto: CreateOssConfigDto): Promise<SysOssConfigEntity> {
    // 如果设为默认，先取消其他默认配置
    if (dto.isDefault) {
      await this.ossConfigRepo.update(
        { isDefault: true },
        { isDefault: false },
      );
    }

    // 归一化：isEnabled -> isActive；domain -> extraConfig.cdnUrl
    const normalized = this.normalizeDto(dto);

    // 加密敏感字段
    if (normalized.accessKey) {
      normalized.accessKey = this.encryptionService.encryptAes(normalized.accessKey as string);
    }
    if (normalized.secretKey) {
      normalized.secretKey = this.encryptionService.encryptAes(normalized.secretKey as string);
    }

    const config = this.ossConfigRepo.create(normalized as Partial<SysOssConfigEntity>);
    const saved = await this.ossConfigRepo.save(config);

    return this.desensitize(saved);
  }

  /**
   * 更新OSS配置
   * 如果传入明文密钥则加密后存储；如果未传入则保留原值
   */
  async updateConfig(
    id: number,
    dto: UpdateOssConfigDto,
  ): Promise<SysOssConfigEntity> {
    const config = await this.getConfigInternal(id);

    // 如果设为默认，先取消其他默认配置
    if (dto.isDefault) {
      await this.ossConfigRepo.update(
        { isDefault: true, id: Not(id) },
        { isDefault: false },
      );
    }

    // 归一化：isEnabled -> isActive；domain -> extraConfig.cdnUrl
    const normalized = this.normalizeDto(dto);

    // 加密敏感字段（仅传入时更新）
    if (dto.accessKey !== undefined && dto.accessKey !== null) {
      normalized.accessKey = this.encryptionService.encryptAes(dto.accessKey);
    }
    if (dto.secretKey !== undefined && dto.secretKey !== null) {
      normalized.secretKey = this.encryptionService.encryptAes(dto.secretKey);
    }

    // 未传 domain 时保留原 extra_config（避免编辑表单未改域名时清空）
    if (dto.domain === undefined) {
      delete normalized.extraConfig;
    }

    Object.assign(config, normalized);
    const saved = await this.ossConfigRepo.save(config);

    return this.desensitize(saved);
  }

  /**
   * 删除OSS配置
   */
  async deleteConfig(id: number): Promise<void> {
    const config = await this.getConfigInternal(id);
    if (config.isDefault) {
      throw new BadRequestException('不能删除默认OSS配置，请先切换默认配置');
    }
    await this.ossConfigRepo.remove(config);
  }

  /**
   * 测试OSS连通性
   * 使用解密后的真实密钥进行测试
   */
  async testConnection(id: number): Promise<{
    success: boolean;
    provider: string;
    latency: number;
    message: string;
  }> {
    const config = await this.getConfigInternal(id);
    if (config.provider === 'local') {
      // 本地存储：校验生成目录可写
      const dir = './uploads/files/generated';
      let probe: string | null = null;
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        probe = path.join(dir, `.probe-${Date.now()}-${randomUUID().slice(0, 8)}`);
        fs.writeFileSync(probe, 'ok');
        return { success: true, provider: 'local', latency: 0, message: '本地存储连通性测试成功' };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { success: false, provider: 'local', latency: 0, message: `本地存储连通性测试失败: ${message}` };
      } finally {
        if (probe) {
          try { fs.unlinkSync(probe); } catch { /* 清理失败不影响连通性结论 */ }
        }
      }
    }
    const result = await this.ossUploadService.probeConfigId(id);
    return {
      success: result.ok,
      provider: config.provider,
      latency: result.latencyMs,
      message: result.message,
    };
  }

  /**
   * 获取存储统计信息（基于 files 表真实数据）
   */
  async getStorageStats(id: number): Promise<{
    configId: number;
    provider: string;
    bucket: string;
    usedStorage: number;
    fileCount: number;
    monthlyUploadCount: number;
    monthlyDownloadTraffic: number;
    lastUploadAt?: string;
  }> {
    const config = await this.getConfigInternal(id);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const agg = (await this.fileRepo
      .createQueryBuilder('f')
      .select('COUNT(*)', 'fileCount')
      .addSelect('COALESCE(SUM(f.size), 0)', 'usedBytes')
      .addSelect(
        "COALESCE(SUM(CASE WHEN f.created_at >= :monthStart THEN 1 ELSE 0 END), 0)",
        'monthlyUploadCount',
      )
      .setParameter('monthStart', monthStart)
      .getRawOne()) as
      | { fileCount?: string; usedBytes?: string; monthlyUploadCount?: string }
      | undefined;
    const last = await this.fileRepo.findOne({ order: { createdAt: 'DESC' } });

    return {
      configId: id,
      provider: config.provider,
      bucket: config.bucket || '-',
      usedStorage: Number(agg?.usedBytes ?? 0),
      fileCount: Number(agg?.fileCount ?? 0),
      monthlyUploadCount: Number(agg?.monthlyUploadCount ?? 0),
      monthlyDownloadTraffic: 0,
      lastUploadAt: last?.createdAt ? last.createdAt.toISOString() : undefined,
    };
  }

  /**
   * 脱敏返回：access_key/secret_key 只显示是否存在
   */
  private desensitize(config: SysOssConfigEntity): SysOssConfigEntity {
    return {
      ...config,
      accessKey: config.accessKey ? '******' : undefined,
      secretKey: config.secretKey ? '******' : undefined,
    };
  }

  /**
   * 归一化入参：isEnabled -> isActive；domain -> extraConfig.cdnUrl
   */
  private normalizeDto(
    dto: CreateOssConfigDto | UpdateOssConfigDto,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {
      ...(dto as unknown as Record<string, unknown>),
    };
    // 兼容旧前端字段 isEnabled
    if (out.isEnabled !== undefined && out.isActive === undefined) {
      out.isActive = out.isEnabled;
    }
    delete out.isEnabled;
    // CDN 域名 -> extraConfig.cdnUrl
    const extra: Record<string, unknown> = {
      ...((out.extraConfig as Record<string, unknown>) ?? {}),
    };
    if (typeof out.domain === 'string' && out.domain.trim() !== '') {
      extra.cdnUrl = out.domain.trim();
    } else if (out.domain === '') {
      delete extra.cdnUrl;
    }
    delete out.domain;
    if (Object.keys(extra).length > 0) {
      out.extraConfig = extra;
    }
    return out;
  }

  /**
   * 内部获取配置（不解敏，用于加密/解密操作）
   */
  private async getConfigInternal(id: number): Promise<SysOssConfigEntity> {
    const config = await this.ossConfigRepo.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`OSS配置 #${id} 不存在`);
    }
    return config;
  }
}
