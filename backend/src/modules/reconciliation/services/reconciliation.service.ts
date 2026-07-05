import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ReconciliationDiffEntity,
  ReconciliationDiffType,
} from '../entities/reconciliation-diff.entity';
import { CreditsService } from '../../credits/services/credits.service';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

/**
 * 对账服务
 * 数据合同真源：Task 30 - 对账体系
 * - 4 类对账：流水vs余额 / Token用量 / 支付vs订单 / Key池扣减
 * - 每日凌晨 02:00 跑全量对账（@nestjs/schedule 未安装，使用 setInterval 调度）
 */
@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(ReconciliationDiffEntity)
    private diffRepo: Repository<ReconciliationDiffEntity>,
    @InjectDataSource() private dataSource: DataSource,
    private creditsService: CreditsService,
  ) {}

  onModuleInit() {
    // 调度每日 02:00 跑全量对账（替代 @Cron('0 0 2 * * *')）
    this.scheduleDaily(2, 0, () => {
      this.runAllReconciliations().catch((err) =>
        this.logger.error(`每日对账失败: ${err?.message || err}`),
      );
    });
  }

  /**
   * 流水 vs 余额对账
   * 规则：account.balance + account.frozenBalance 应等于
   *       SUM(recharge+reward+admin_adjust) - SUM(settle)
   */
  async reconcileBalanceVsTransactions(): Promise<ReconciliationDiffEntity[]> {
    const diffs: ReconciliationDiffEntity[] = [];
    const rows: any[] = await this.dataSource.query(`
      SELECT
        a.user_id AS userId,
        (a.balance + a.frozen_balance) AS actual,
        COALESCE(SUM(CASE WHEN t.type IN ('recharge','reward') THEN t.amount ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN t.type = 'admin_adjust' THEN t.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN t.type = 'settle' THEN t.amount ELSE 0 END), 0) AS expected
      FROM credit_accounts a
      LEFT JOIN credit_transactions t ON t.user_id = a.user_id
      GROUP BY a.user_id, a.balance, a.frozen_balance
    `);
    for (const row of rows) {
      const actual = Number(row.actual);
      const expected = Number(row.expected);
      const diff = actual - expected;
      if (Math.abs(diff) > 0.0001) {
        const entity = this.diffRepo.create({
          type: 'balance_vs_txn',
          userId: Number(row.userId),
          diffAmount: diff,
          detail: { actual, expected },
        });
        diffs.push(await this.diffRepo.save(entity));
      }
    }
    return diffs;
  }

  /**
   * Token 用量对账
   * 规则：model_call_logs.total_cost 之和 应等于
   *       credit_transactions.amount where source='model_call' AND type='settle'
   */
  async reconcileTokenUsage(): Promise<ReconciliationDiffEntity[]> {
    const diffs: ReconciliationDiffEntity[] = [];
    try {
      const rows: any[] = await this.dataSource.query(`
        SELECT
          t.user_id AS userId,
          COALESCE(SUM(t.amount), 0) AS charged,
          (SELECT COALESCE(SUM(m.total_cost), 0) FROM model_call_logs m WHERE m.user_id = t.user_id) AS logged
        FROM credit_transactions t
        WHERE t.source = 'model_call' AND t.type = 'settle'
        GROUP BY t.user_id
      `);
      for (const row of rows) {
        const charged = Number(row.charged);
        const logged = Number(row.logged);
        const diff = charged - logged;
        if (Math.abs(diff) > 0.0001) {
          const entity = this.diffRepo.create({
            type: 'token_usage',
            userId: Number(row.userId),
            diffAmount: diff,
            detail: { charged, logged },
          });
          diffs.push(await this.diffRepo.save(entity));
        }
      }
    } catch (err) {
      this.logger.warn(`Token 用量对账跳过（表可能不存在）: ${(err as Error).message}`);
    }
    return diffs;
  }

  /**
   * 支付流水 vs 充值订单对账
   * 规则：SUM(payment_records.amount where status='paid') 应等于
   *       SUM(recharge_orders.amount where status='paid')
   */
  async reconcilePaymentVsOrders(): Promise<ReconciliationDiffEntity[]> {
    const diffs: ReconciliationDiffEntity[] = [];
    const rows: any[] = await this.dataSource.query(`
      SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM payment_records WHERE status = 'paid') AS paidTotal,
        (SELECT COALESCE(SUM(amount), 0) FROM recharge_orders WHERE status = 'paid') AS orderTotal
    `);
    const row = rows[0] || {};
    const paidTotal = Number(row.paidTotal || 0);
    const orderTotal = Number(row.orderTotal || 0);
    const diff = paidTotal - orderTotal;
    if (Math.abs(diff) > 0.01) {
      const entity = this.diffRepo.create({
        type: 'payment_vs_order',
        userId: 0,
        diffAmount: diff,
        detail: { paidTotal, orderTotal },
      });
      diffs.push(await this.diffRepo.save(entity));
    }
    return diffs;
  }

  /**
   * Key 池扣减对账
   * 规则：SUM(api_key_pool.used_quota) 应等于 SUM(model_call_logs.total_cost)
   */
  async reconcileApiKeyPoolDeduction(): Promise<ReconciliationDiffEntity[]> {
    const diffs: ReconciliationDiffEntity[] = [];
    try {
      const rows: any[] = await this.dataSource.query(`
        SELECT
          (SELECT COALESCE(SUM(used_quota), 0) FROM api_key_pool) AS poolUsed,
          (SELECT COALESCE(SUM(total_cost), 0) FROM model_call_logs) AS logged
      `);
      const row = rows[0] || {};
      const poolUsed = Number(row.poolUsed || 0);
      const logged = Number(row.logged || 0);
      const diff = poolUsed - logged;
      if (Math.abs(diff) > 0.0001) {
        const entity = this.diffRepo.create({
          type: 'apikey_pool_deduction',
          userId: 0,
          diffAmount: diff,
          detail: { poolUsed, logged },
        });
        diffs.push(await this.diffRepo.save(entity));
      }
    } catch (err) {
      this.logger.warn(`Key 池对账跳过（表可能不存在）: ${(err as Error).message}`);
    }
    return diffs;
  }

  /** 跑全部 4 类对账 */
  async runAllReconciliations(): Promise<{
    balance_vs_txn: number;
    token_usage: number;
    payment_vs_order: number;
    apikey_pool_deduction: number;
  }> {
    const [a, b, c, d] = await Promise.all([
      this.reconcileBalanceVsTransactions(),
      this.reconcileTokenUsage(),
      this.reconcilePaymentVsOrders(),
      this.reconcileApiKeyPoolDeduction(),
    ]);
    return {
      balance_vs_txn: a.length,
      token_usage: b.length,
      payment_vs_order: c.length,
      apikey_pool_deduction: d.length,
    };
  }

  /** 分页查询差异 */
  async getDiffs(
    query: PaginationQuery & { type?: ReconciliationDiffType; status?: string },
  ): Promise<PaginatedResult<ReconciliationDiffEntity>> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 10));
    const qb = this.diffRepo.createQueryBuilder('d');
    if (query.type) {
      qb.andWhere('d.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('d.status = :status', { status: query.status });
    }
    qb.orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 手动调整：写 admin_adjust 流水 + 标记 resolved */
  async adjustDiff(
    diffId: number,
    adminId: number,
    amount: number,
    remark?: string,
  ): Promise<ReconciliationDiffEntity> {
    const diff = await this.diffRepo.findOne({ where: { id: diffId } });
    if (!diff) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '对账差异不存在');
    }
    if (diff.userId && diff.userId > 0) {
      await this.creditsService.adminAdjust(diff.userId, amount, adminId, remark);
    }
    diff.status = 'resolved';
    diff.resolvedBy = adminId;
    diff.resolvedAt = new Date();
    diff.remark = remark || diff.remark;
    return this.diffRepo.save(diff);
  }

  /** 标记忽略 */
  async ignoreDiff(
    diffId: number,
    adminId: number,
    remark?: string,
  ): Promise<ReconciliationDiffEntity> {
    const diff = await this.diffRepo.findOne({ where: { id: diffId } });
    if (!diff) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '对账差异不存在');
    }
    diff.status = 'ignored';
    diff.resolvedBy = adminId;
    diff.resolvedAt = new Date();
    diff.remark = remark || diff.remark;
    return this.diffRepo.save(diff);
  }

  /** 健康检查 */
  health() {
    return { status: 'ok', module: 'reconciliation' };
  }

  // ============ 内部调度工具 ============

  /** 在每日指定 hour:minute 调度任务（替代 @Cron） */
  private scheduleDaily(hour: number, minute: number, fn: () => void): void {
    const now = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0,
    );
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      fn();
      setInterval(fn, 24 * 60 * 60 * 1000);
    }, delay);
  }
}
