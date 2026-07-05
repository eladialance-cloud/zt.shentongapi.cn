import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyPoolEntity, ApiKeyStatus } from '../entities/api-key-pool.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

const ERROR_THRESHOLD = 5;

/**
 * API Key 池服务
 * 数据合同真源：Task 32 - 数据安全设计
 * 定时任务（@nestjs/schedule 未安装，使用 OnModuleInit + setInterval 调度）：
 *   - 每日 00:00 重置 dailyUsedQuota
 *   - 每月 1 日 00:00 重置 monthlyUsedQuota
 *   - 每 10 分钟检查 active Key 余额
 */
@Injectable()
export class ApiKeyPoolService implements OnModuleInit {
  private readonly logger = new Logger(ApiKeyPoolService.name);

  constructor(
    @InjectRepository(ApiKeyPoolEntity)
    private keyRepo: Repository<ApiKeyPoolEntity>,
    private encryption: EncryptionService,
  ) {}

  onModuleInit() {
    // 每日 00:00 重置日配额
    this.scheduleDaily(0, 0, () => this.resetDailyQuota().catch((e) =>
      this.logger.error(`重置日配额失败: ${e?.message || e}`),
    ));
    // 每月 1 日 00:00 重置月配额
    this.scheduleMonthly(() => this.resetMonthlyQuota().catch((e) =>
      this.logger.error(`重置月配额失败: ${e?.message || e}`),
    ));
    // 每 10 分钟检查余额
    setInterval(() => this.checkBalance().catch((e) =>
      this.logger.error(`余额检查失败: ${e?.message || e}`),
    ), 10 * 60 * 1000);
  }

  /**
   * 取下一个可用 Key：priority ASC, usedQuota ASC
   * 跳过 status != active / remainingQuota <= 0 / errorCount >= 5
   */
  async getNextAvailableKey(provider: string): Promise<ApiKeyPoolEntity | null> {
    const key = await this.keyRepo
      .createQueryBuilder('k')
      .where('k.provider = :provider', { provider })
      .andWhere('k.status = :status', { status: 'active' })
      .andWhere('k.remaining_quota > 0')
      .andWhere('k.error_count < :threshold', { threshold: ERROR_THRESHOLD })
      .orderBy('k.priority', 'ASC')
      .addOrderBy('k.used_quota', 'ASC')
      .getOne();
    return key || null;
  }

  /** 标记额度耗尽 */
  async markExhausted(keyId: number): Promise<void> {
    await this.keyRepo.update(keyId, { status: 'exhausted' });
  }

  /** 错误计数 +1，达 5 次标记 error */
  async markError(keyId: number): Promise<void> {
    const key = await this.keyRepo.findOne({ where: { id: keyId } });
    if (!key) {
      return;
    }
    const errorCount = key.errorCount + 1;
    const patch: Partial<ApiKeyPoolEntity> = { errorCount };
    if (errorCount >= ERROR_THRESHOLD) {
      patch.status = 'error';
    }
    await this.keyRepo.update(keyId, patch);
  }

  /** 扣减额度，remainingQuota <= 0 标记 exhausted */
  async deductQuota(keyId: number, amount: number): Promise<void> {
    const key = await this.keyRepo.findOne({ where: { id: keyId } });
    if (!key) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'API Key 不存在');
    }
    const usedQuota = Number(key.usedQuota) + amount;
    const remainingQuota = Number(key.remainingQuota) - amount;
    const dailyUsedQuota = Number(key.dailyUsedQuota) + amount;
    const monthlyUsedQuota = Number(key.monthlyUsedQuota) + amount;
    const patch: Partial<ApiKeyPoolEntity> = {
      usedQuota,
      remainingQuota,
      dailyUsedQuota,
      monthlyUsedQuota,
      lastUsedAt: new Date(),
    };
    if (remainingQuota <= 0) {
      patch.status = 'exhausted';
    }
    await this.keyRepo.update(keyId, patch);
  }

  /** 重置所有 Key 的 dailyUsedQuota（每日 00:00） */
  async resetDailyQuota(): Promise<void> {
    await this.keyRepo
      .createQueryBuilder()
      .update()
      .set({ dailyUsedQuota: 0 })
      .execute();
    this.logger.log('已重置全部 Key 日配额');
  }

  /** 重置所有 Key 的 monthlyUsedQuota（每月 1 日 00:00） */
  async resetMonthlyQuota(): Promise<void> {
    await this.keyRepo
      .createQueryBuilder()
      .update()
      .set({ monthlyUsedQuota: 0 })
      .execute();
    this.logger.log('已重置全部 Key 月配额');
  }

  /** 检查 active Key 余额（mock：更新 lastCheckAt） */
  async checkBalance(): Promise<void> {
    await this.keyRepo
      .createQueryBuilder()
      .update()
      .set({ lastCheckAt: new Date() })
      .where('status = :status', { status: 'active' })
      .execute();
  }

  // ============ CRUD ============

  async list(provider?: string): Promise<ApiKeyPoolEntity[]> {
    const qb = this.keyRepo.createQueryBuilder('k');
    if (provider) {
      qb.andWhere('k.provider = :provider', { provider });
    }
    qb.orderBy('k.priority', 'ASC').addOrderBy('k.createdAt', 'DESC');
    const keys = await qb.getMany();
    return keys.map((k) => this.maskKey(k));
  }

  async get(id: number): Promise<ApiKeyPoolEntity> {
    const key = await this.keyRepo.findOne({ where: { id } });
    if (!key) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'API Key 不存在');
    }
    return this.maskKey(key);
  }

  async create(data: Partial<ApiKeyPoolEntity>): Promise<ApiKeyPoolEntity> {
    if (!data.apiKey) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, 'apiKey 必填');
    }
    const totalQuota = Number(data.totalQuota || 0);
    const usedQuota = Number(data.usedQuota || 0);
    const entity = this.keyRepo.create({
      provider: data.provider,
      apiKey: this.encryption.encryptAes(data.apiKey),
      alias: data.alias,
      priority: data.priority ?? 0,
      status: 'active',
      modelConfigId: data.modelConfigId,
      totalQuota,
      usedQuota,
      remainingQuota: totalQuota - usedQuota,
      dailyQuota: data.dailyQuota,
      monthlyQuota: data.monthlyQuota,
      dailyUsedQuota: 0,
      monthlyUsedQuota: 0,
      errorCount: 0,
    });
    const saved = await this.keyRepo.save(entity);
    return this.maskKey(saved);
  }

  async update(id: number, data: Partial<ApiKeyPoolEntity>): Promise<ApiKeyPoolEntity> {
    const key = await this.keyRepo.findOne({ where: { id } });
    if (!key) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'API Key 不存在');
    }
    const patch: Partial<ApiKeyPoolEntity> = {};
    if (data.provider !== undefined) patch.provider = data.provider;
    if (data.alias !== undefined) patch.alias = data.alias;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.status !== undefined) patch.status = data.status;
    if (data.modelConfigId !== undefined) patch.modelConfigId = data.modelConfigId;
    if (data.apiKey !== undefined) patch.apiKey = this.encryption.encryptAes(data.apiKey);
    if (data.totalQuota !== undefined) {
      patch.totalQuota = Number(data.totalQuota);
      patch.remainingQuota = Number(data.totalQuota) - Number(key.usedQuota);
    }
    await this.keyRepo.update(id, patch);
    return this.get(id);
  }

  async delete(id: number): Promise<void> {
    const key = await this.keyRepo.findOne({ where: { id } });
    if (!key) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'API Key 不存在');
    }
    await this.keyRepo.delete(id);
  }

  /** 重置错误计数 */
  async resetErrors(id: number): Promise<void> {
    const key = await this.keyRepo.findOne({ where: { id } });
    if (!key) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'API Key 不存在');
    }
    await this.keyRepo.update(id, { errorCount: 0, status: 'active' });
  }

  /** 设置限额 */
  async setLimits(
    id: number,
    dailyQuota?: number,
    monthlyQuota?: number,
  ): Promise<ApiKeyPoolEntity> {
    const key = await this.keyRepo.findOne({ where: { id } });
    if (!key) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'API Key 不存在');
    }
    const patch: Partial<ApiKeyPoolEntity> = {};
    if (dailyQuota !== undefined) patch.dailyQuota = dailyQuota;
    if (monthlyQuota !== undefined) patch.monthlyQuota = monthlyQuota;
    await this.keyRepo.update(id, patch);
    return this.get(id);
  }

  /** 统计：总数/活跃/耗尽/错误/今日消耗/本月消耗 */
  async getStats(): Promise<{
    total: number;
    active: number;
    exhausted: number;
    error: number;
    disabled: number;
    dailyConsumed: number;
    monthlyConsumed: number;
  }> {
    const total = await this.keyRepo.count();
    const active = await this.keyRepo.count({ where: { status: 'active' as ApiKeyStatus } });
    const exhausted = await this.keyRepo.count({ where: { status: 'exhausted' as ApiKeyStatus } });
    const error = await this.keyRepo.count({ where: { status: 'error' as ApiKeyStatus } });
    const disabled = await this.keyRepo.count({ where: { status: 'disabled' as ApiKeyStatus } });
    const agg: any = await this.keyRepo
      .createQueryBuilder('k')
      .select('COALESCE(SUM(k.daily_used_quota),0)', 'dailyConsumed')
      .addSelect('COALESCE(SUM(k.monthly_used_quota),0)', 'monthlyConsumed')
      .getRawOne();
    return {
      total,
      active,
      exhausted,
      error,
      disabled,
      dailyConsumed: Number(agg?.dailyConsumed || 0),
      monthlyConsumed: Number(agg?.monthlyConsumed || 0),
    };
  }

  /** 健康检查 */
  health() {
    return { status: 'ok', module: 'api-key-pool' };
  }

  // ============ 内部工具 ============

  /** 脱敏返回（仅显示密钥前4后4） */
  private maskKey(key: ApiKeyPoolEntity): ApiKeyPoolEntity {
    let plain = '';
    try {
      plain = this.encryption.decryptAes(key.apiKey);
    } catch {
      plain = key.apiKey;
    }
    if (plain.length > 8) {
      key.apiKey = `${plain.slice(0, 4)}****${plain.slice(-4)}`;
    } else {
      key.apiKey = '****';
    }
    return key;
  }

  private scheduleDaily(hour: number, minute: number, fn: () => void): void {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      fn();
      setInterval(fn, 24 * 60 * 60 * 1000);
    }, delay);
  }

  private scheduleMonthly(fn: () => void): void {
    // 每月 1 日 00:00 触发：每日 00:00 检查是否为 1 号
    this.scheduleDaily(0, 0, () => {
      const today = new Date();
      if (today.getDate() === 1) {
        fn();
      }
    });
  }
}
