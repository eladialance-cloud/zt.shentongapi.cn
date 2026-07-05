import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SyncRecordEntity, SyncRecordType } from '../entities/sync-record.entity';

/** 每批最大上行条数 */
const MAX_BATCH_SIZE = 100;

export interface SyncUploadItem {
  clientTxnId: string;
  type: SyncRecordType;
  payload: Record<string, unknown>;
}

export interface SyncPullResult {
  agents: any[];
  workflows: any[];
  plugins: any[];
  models: any[];
  credits: any;
  announcements: any[];
  userLevel: any;
  serverTime: string;
}

/**
 * 同步服务
 * 数据合同真源：Task 31 - 数据同步设计
 * - 批量上行：clientTxnId 幂等去重
 * - 增量下行：返回 since 之后变更的 7 类数据
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(SyncRecordEntity)
    private syncRepo: Repository<SyncRecordEntity>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  /** 批量上行（每批最多 100 条，clientTxnId 幂等去重） */
  async batchUpload(
    userId: number,
    items: SyncUploadItem[],
  ): Promise<{ accepted: number; skipped: number }> {
    if (items.length > MAX_BATCH_SIZE) {
      items = items.slice(0, MAX_BATCH_SIZE);
    }
    if (items.length === 0) {
      return { accepted: 0, skipped: 0 };
    }
    // 查询已存在的 clientTxnId（幂等去重）
    const clientTxnIds = items.map((i) => i.clientTxnId);
    const existing = await this.syncRepo
      .createQueryBuilder('s')
      .select(['s.clientTxnId'])
      .where('s.user_id = :userId', { userId })
      .andWhere('s.client_txn_id IN (:...ids)', { ids: clientTxnIds })
      .getMany();
    const existingSet = new Set(existing.map((e) => e.clientTxnId));
    const toInsert = items.filter((i) => !existingSet.has(i.clientTxnId));
    if (toInsert.length === 0) {
      return { accepted: 0, skipped: items.length };
    }
    const entities = toInsert.map((i) =>
      this.syncRepo.create({
        userId,
        clientTxnId: i.clientTxnId,
        type: i.type,
        payload: i.payload,
        status: 'pending',
      }),
    );
    await this.syncRepo.save(entities);
    return { accepted: toInsert.length, skipped: items.length - toInsert.length };
  }

  /** 增量下行：返回 since 之后变更的 7 类数据 */
  async pull(
    userId: number,
    since: Date,
    types?: string[],
  ): Promise<SyncPullResult> {
    const want = (key: string) => !types || types.length === 0 || types.includes(key);
    const sinceStr = since.toISOString();

    const result: SyncPullResult = {
      agents: [],
      workflows: [],
      plugins: [],
      models: [],
      credits: null as any,
      announcements: [],
      userLevel: null as any,
      serverTime: new Date().toISOString(),
    };

    if (want('agent')) {
      try {
        result.agents = await this.dataSource.query(
          `SELECT * FROM agents WHERE updated_at > ? ORDER BY updated_at ASC`,
          [sinceStr],
        );
      } catch (e) {
        this.logger.debug?.(`agents 拉取跳过: ${(e as Error).message}`);
      }
    }
    if (want('workflow')) {
      try {
        result.workflows = await this.dataSource.query(
          `SELECT * FROM workflows WHERE updated_at > ? ORDER BY updated_at ASC`,
          [sinceStr],
        );
      } catch (e) {
        this.logger.debug?.(`workflows 拉取跳过: ${(e as Error).message}`);
      }
    }
    if (want('plugin')) {
      try {
        result.plugins = await this.dataSource.query(
          `SELECT * FROM plugins WHERE updated_at > ? ORDER BY updated_at ASC`,
          [sinceStr],
        );
      } catch (e) {
        this.logger.debug?.(`plugins 拉取跳过: ${(e as Error).message}`);
      }
    }
    if (want('model')) {
      try {
        result.models = await this.dataSource.query(
          `SELECT * FROM models WHERE updated_at > ? ORDER BY updated_at ASC`,
          [sinceStr],
        );
      } catch (e) {
        this.logger.debug?.(`models 拉取跳过: ${(e as Error).message}`);
      }
    }
    if (want('credits')) {
      try {
        const rows = await this.dataSource.query(
          `SELECT user_id, balance, frozen_balance, total_recharged, total_consumed, updated_at
           FROM credit_accounts WHERE user_id = ?`,
          [userId],
        );
        result.credits = rows[0] || null;
      } catch (e) {
        this.logger.debug?.(`credits 拉取跳过: ${(e as Error).message}`);
      }
    }
    if (want('user-level')) {
      try {
        const rows = await this.dataSource.query(
          `SELECT id, level, updated_at FROM users WHERE id = ?`,
          [userId],
        );
        result.userLevel = rows[0] || null;
      } catch (e) {
        this.logger.debug?.(`user-level 拉取跳过: ${(e as Error).message}`);
      }
    }
    // announcement: 暂无实体表，返回空数组
    return result;
  }

  /** 查询同步状态：待上报数 / 最后同步时间 */
  async getSyncStatus(
    userId: number,
  ): Promise<{ pendingCount: number; lastSyncAt: Date | null }> {
    const pendingCount = await this.syncRepo.count({
      where: { userId, status: 'pending' },
    });
    const last = await this.syncRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return {
      pendingCount,
      lastSyncAt: last?.createdAt || null,
    };
  }

  /** 健康检查 */
  health() {
    return { status: 'ok', module: 'sync' };
  }
}
