import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuntimeVersionEntity } from '../entities/runtime-version.entity';

export interface RuntimeVersionInfo {
  version: string;
  downloadUrl: string;
  sha256: string;
  changelog: string | null;
  forceUpdate: boolean;
  minAppVersion: string | null;
}

export type RuntimeCheckUpdateResult = {
  openclaw: RuntimeVersionInfo | null;
  n8n: RuntimeVersionInfo | null;
  mcp: RuntimeVersionInfo | null;
};

@Injectable()
export class RuntimeService {
  private readonly logger = new Logger(RuntimeService.name);

  constructor(
    @InjectRepository(RuntimeVersionEntity)
    private runtimeRepo: Repository<RuntimeVersionEntity>,
  ) {}

  /**
   * 查询各引擎在指定平台的最新激活版本
   * 数据合同真源：深瞳AI_全栈部署方案_20260708.md 第 3.3 节
   */
  async checkUpdate(platform: string): Promise<RuntimeCheckUpdateResult> {
    // 查询所有 is_active=true AND platform=? 的记录
    const rows = await this.runtimeRepo.find({
      where: { isActive: true, platform },
      order: { createdAt: 'DESC' },
    });

    // 按 service_name 分组取最新一条（已按 created_at DESC 排序，首个即最新）
    const latestByService = new Map<string, RuntimeVersionEntity>();
    for (const row of rows) {
      if (!latestByService.has(row.serviceName)) {
        latestByService.set(row.serviceName, row);
      }
    }

    const toInfo = (e: RuntimeVersionEntity | undefined): RuntimeVersionInfo | null => {
      if (!e) return null;
      return {
        version: e.version,
        downloadUrl: e.downloadUrl,
        sha256: e.sha256,
        changelog: e.changelog ?? null,
        forceUpdate: e.forceUpdate,
        minAppVersion: e.minAppVersion ?? null,
      };
    };

    return {
      openclaw: toInfo(latestByService.get('openclaw')),
      n8n: toInfo(latestByService.get('n8n')),
      mcp: toInfo(latestByService.get('mcp')),
    };
  }

  /** 健康检查 */
  health() {
    return { status: 'ok', module: 'runtime' };
  }
}
