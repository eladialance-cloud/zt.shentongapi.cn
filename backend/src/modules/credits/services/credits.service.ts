import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreditAccountEntity } from '../entities/credit-account.entity';
import {
  CreditTransactionEntity,
  CreditTxnSource,
  CreditTxnType,
} from '../entities/credit-transaction.entity';
import { RedisService } from '../../../common/services/redis.service';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import {
  PaginationQuery,
  PaginatedResult,
} from '../../../common/types/pagination.type';

/** 分布式锁重试次数与过期时间 */
const LOCK_RETRY = 5;
const LOCK_TTL_SECONDS = 30;
const LOCK_RETRY_INTERVAL_MS = 100;

export interface CreditTxnQuery extends PaginationQuery {
  type?: CreditTxnType;
  source?: CreditTxnSource;
  startDate?: string;
  endDate?: string;
}

/**
 * 积分服务：积分账户与流水
 * 数据合同真源：Task 29 - 积分数据流完整链路
 * - 充值入账、奖励入账、管理员调整：直接写流水 + 改余额
 * - 预扣减 freeze：Redis 分布式锁 + 事务 + 乐观锁 version++
 * - 结算 settle：幂等（settledAt 标记），多退少补
 * - 退款 refund：全额退回冻结金额
 */
@Injectable()
export class CreditsService {
  constructor(
    @InjectRepository(CreditAccountEntity)
    private accountRepo: Repository<CreditAccountEntity>,
    @InjectRepository(CreditTransactionEntity)
    private txnRepo: Repository<CreditTransactionEntity>,
    @InjectDataSource() private dataSource: DataSource,
    private redis: RedisService,
  ) {}

  /** 获取或创建账户 */
  async getOrCreateAccount(userId: number): Promise<CreditAccountEntity> {
    let account = await this.accountRepo.findOne({ where: { userId } });
    if (!account) {
      account = this.accountRepo.create({
        userId,
        balance: 0,
        frozenBalance: 0,
        totalRecharged: 0,
        totalConsumed: 0,
        version: 0,
      });
      account = await this.accountRepo.save(account);
    }
    return account;
  }

  /** 查询账户 */
  async getAccount(userId: number): Promise<CreditAccountEntity> {
    return this.getOrCreateAccount(userId);
  }

  /** 充值入账 */
  async rechargeCredits(
    userId: number,
    amount: number,
    sourceId: string,
    remark?: string,
  ): Promise<CreditTransactionEntity> {
    if (amount <= 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '充值金额必须大于 0');
    }
    return this.withLock(userId, async () => {
      return this.dataSource.transaction(async (manager) => {
        const account = await this.getOrCreateAccountLocked(manager, userId);
        const balanceBefore = account.balance;
        const balanceAfter = balanceBefore + amount;
        await this.updateAccountVersioned(manager, account.id, account.version, {
          balance: balanceAfter,
          totalRecharged: account.totalRecharged + amount,
        });
        const txn = manager.getRepository(CreditTransactionEntity).create({
          userId,
          type: 'recharge',
          amount,
          balanceBefore,
          balanceAfter,
          source: 'recharge',
          sourceId,
          remark,
        });
        return manager.getRepository(CreditTransactionEntity).save(txn);
      });
    });
  }

  /** 奖励入账 */
  async rewardCredits(
    userId: number,
    amount: number,
    source: CreditTxnSource,
    sourceId: string,
    remark?: string,
  ): Promise<CreditTransactionEntity> {
    if (amount <= 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '奖励金额必须大于 0');
    }
    return this.withLock(userId, async () => {
      return this.dataSource.transaction(async (manager) => {
        const account = await this.getOrCreateAccountLocked(manager, userId);
        const balanceBefore = account.balance;
        const balanceAfter = balanceBefore + amount;
        await this.updateAccountVersioned(manager, account.id, account.version, {
          balance: balanceAfter,
        });
        const txn = manager.getRepository(CreditTransactionEntity).create({
          userId,
          type: 'reward',
          amount,
          balanceBefore,
          balanceAfter,
          source,
          sourceId,
          remark,
        });
        return manager.getRepository(CreditTransactionEntity).save(txn);
      });
    });
  }

  /** 管理员调整（可正可负） */
  async adminAdjust(
    userId: number,
    amount: number,
    adminId: number,
    remark?: string,
  ): Promise<CreditTransactionEntity> {
    if (amount === 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '调整金额不能为 0');
    }
    return this.withLock(userId, async () => {
      return this.dataSource.transaction(async (manager) => {
        const account = await this.getOrCreateAccountLocked(manager, userId);
        const balanceBefore = account.balance;
        const balanceAfter = balanceBefore + amount;
        if (balanceAfter < 0) {
          BusinessException.throw(
            ErrorCode.VALIDATION_FAILED,
            '调整后余额不能为负',
          );
        }
        await this.updateAccountVersioned(manager, account.id, account.version, {
          balance: balanceAfter,
          totalConsumed:
            amount < 0 ? account.totalConsumed + Math.abs(amount) : account.totalConsumed,
        });
        const txn = manager.getRepository(CreditTransactionEntity).create({
          userId,
          type: 'admin_adjust',
          amount,
          balanceBefore,
          balanceAfter,
          source: 'admin_adjust',
          sourceId: `admin_${adminId}_${Date.now()}`,
          adminId,
          remark,
        });
        return manager.getRepository(CreditTransactionEntity).save(txn);
      });
    });
  }

  /**
   * 预扣减（冻结）
   * - Redis 分布式锁 credits:lock:<userId> SET NX EX 30s 重试 5 次
   * - 事务 + 乐观锁 version++
   * - 返回冻结流水（type=freeze），其 id 即为 frozenTxnId
   */
  async freezeCredits(
    userId: number,
    amount: number,
    source: CreditTxnSource,
    sourceId: string,
  ): Promise<CreditTransactionEntity> {
    if (amount <= 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '冻结金额必须大于 0');
    }
    return this.withLock(userId, async () => {
      return this.dataSource.transaction(async (manager) => {
        const account = await this.getOrCreateAccountLocked(manager, userId);
        if (account.balance < amount) {
          BusinessException.throw(
            ErrorCode.FORBIDDEN,
            '积分余额不足，无法预扣减',
          );
        }
        const balanceBefore = account.balance;
        const balanceAfter = balanceBefore - amount;
        await this.updateAccountVersioned(manager, account.id, account.version, {
          balance: balanceAfter,
          frozenBalance: account.frozenBalance + amount,
        });
        const txn = manager.getRepository(CreditTransactionEntity).create({
          userId,
          type: 'freeze',
          amount,
          balanceBefore,
          balanceAfter,
          source,
          sourceId,
        });
        return manager.getRepository(CreditTransactionEntity).save(txn);
      });
    });
  }

  /**
   * 结算（多退少补）
   * - 校验 settledAt IS NULL 幂等
   * - actualAmount > 冻结金额：补扣差额；actualAmount < 冻结金额：退回差额
   * - 写 type=settle 流水，frozenTxnId 关联冻结流水
   */
  async settleCredits(
    userId: number,
    frozenTxnId: number,
    actualAmount: number,
  ): Promise<CreditTransactionEntity> {
    if (actualAmount < 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '结算金额不能为负');
    }
    return this.withLock(userId, async () => {
      return this.dataSource.transaction(async (manager) => {
        const frozenTxn = await manager
          .getRepository(CreditTransactionEntity)
          .findOne({ where: { id: frozenTxnId, userId, type: 'freeze' } });
        if (!frozenTxn) {
          BusinessException.throw(ErrorCode.NOT_FOUND, '冻结流水不存在');
        }
        if (frozenTxn.settledAt) {
          // 幂等：已结算，直接返回原结算流水（若存在）
          const existing = await manager
            .getRepository(CreditTransactionEntity)
            .findOne({ where: { frozenTxnId, type: 'settle' } });
          return existing as CreditTransactionEntity;
        }
        const account = await this.getOrCreateAccountLocked(manager, userId);
        const frozenAmount = frozenTxn.amount;
        const diff = actualAmount - frozenAmount; // >0 需补扣，<0 需退回
        const balanceBefore = account.balance;
        let balanceAfter = balanceBefore;
        if (diff > 0) {
          // 补扣差额
          if (account.balance < diff) {
            BusinessException.throw(
              ErrorCode.FORBIDDEN,
              '积分余额不足，无法结算补扣',
            );
          }
          balanceAfter = balanceBefore - diff;
        } else if (diff < 0) {
          // 退回差额
          balanceAfter = balanceBefore + Math.abs(diff);
        }
        await this.updateAccountVersioned(manager, account.id, account.version, {
          balance: balanceAfter,
          frozenBalance: account.frozenBalance - frozenAmount,
          totalConsumed: account.totalConsumed + actualAmount,
        });
        // 标记冻结流水已结算
        frozenTxn.settledAt = new Date();
        await manager.getRepository(CreditTransactionEntity).save(frozenTxn);
        const settleTxn = manager.getRepository(CreditTransactionEntity).create({
          userId,
          type: 'settle',
          amount: actualAmount,
          balanceBefore,
          balanceAfter,
          source: frozenTxn.source,
          sourceId: frozenTxn.sourceId,
          frozenTxnId,
          remark: `结算冻结流水 #${frozenTxnId}`,
        });
        return manager.getRepository(CreditTransactionEntity).save(settleTxn);
      });
    });
  }

  /** 退款：全额退回冻结金额（幂等：已结算则返回） */
  async refundCredits(
    userId: number,
    frozenTxnId: number,
  ): Promise<CreditTransactionEntity> {
    return this.withLock(userId, async () => {
      return this.dataSource.transaction(async (manager) => {
        const frozenTxn = await manager
          .getRepository(CreditTransactionEntity)
          .findOne({ where: { id: frozenTxnId, userId, type: 'freeze' } });
        if (!frozenTxn) {
          BusinessException.throw(ErrorCode.NOT_FOUND, '冻结流水不存在');
        }
        if (frozenTxn.settledAt) {
          const existing = await manager
            .getRepository(CreditTransactionEntity)
            .findOne({ where: { frozenTxnId, type: 'refund' } });
          return existing as CreditTransactionEntity;
        }
        const account = await this.getOrCreateAccountLocked(manager, userId);
        const frozenAmount = frozenTxn.amount;
        const balanceBefore = account.balance;
        const balanceAfter = balanceBefore + frozenAmount;
        await this.updateAccountVersioned(manager, account.id, account.version, {
          balance: balanceAfter,
          frozenBalance: account.frozenBalance - frozenAmount,
        });
        frozenTxn.settledAt = new Date();
        await manager.getRepository(CreditTransactionEntity).save(frozenTxn);
        const refundTxn = manager.getRepository(CreditTransactionEntity).create({
          userId,
          type: 'refund',
          amount: frozenAmount,
          balanceBefore,
          balanceAfter,
          source: frozenTxn.source,
          sourceId: frozenTxn.sourceId,
          frozenTxnId,
          remark: `退款冻结流水 #${frozenTxnId}`,
        });
        return manager.getRepository(CreditTransactionEntity).save(refundTxn);
      });
    });
  }

  /** 分页查询流水 */
  async getTransactions(
    userId: number,
    query: CreditTxnQuery,
  ): Promise<PaginatedResult<CreditTransactionEntity>> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 10));
    const qb = this.txnRepo
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId });
    if (query.type) {
      qb.andWhere('t.type = :type', { type: query.type });
    }
    if (query.source) {
      qb.andWhere('t.source = :source', { source: query.source });
    }
    if (query.startDate) {
      qb.andWhere('t.created_at >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('t.created_at <= :endDate', { endDate: query.endDate });
    }
    qb.orderBy('t.created_at', 'DESC')
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

  // ============ 内部工具 ============

  /** 分布式锁包装器：重试 5 次，每次间隔 100ms */
  private async withLock<T>(
    userId: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `credits:lock:${userId}`;
    const lockValue = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let acquired = false;
    for (let i = 0; i < LOCK_RETRY; i++) {
      acquired = await this.redis.setNx(lockKey, lockValue, LOCK_TTL_SECONDS);
      if (acquired) break;
      await this.sleep(LOCK_RETRY_INTERVAL_MS);
    }
    if (!acquired) {
      BusinessException.throw(
        ErrorCode.FORBIDDEN,
        '积分操作繁忙，请稍后重试',
      );
    }
    try {
      return await fn();
    } finally {
      // 仅在锁仍属本线程时释放（防误删）
      const current = await this.redis.get(lockKey);
      if (current === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  /** 事务内读取账户（带行锁） */
  private async getOrCreateAccountLocked(
    manager: any,
    userId: number,
  ): Promise<CreditAccountEntity> {
    const repo = manager.getRepository(CreditAccountEntity);
    let account = await repo
      .createQueryBuilder('a')
      .setLock('pessimistic_write')
      .where('a.user_id = :userId', { userId })
      .getOne();
    if (!account) {
      account = repo.create({
        userId,
        balance: 0,
        frozenBalance: 0,
        totalRecharged: 0,
        totalConsumed: 0,
        version: 0,
      });
      account = await repo.save(account);
    }
    return account;
  }

  /** 乐观锁更新：WHERE version = oldVersion，自增 version */
  private async updateAccountVersioned(
    manager: any,
    accountId: number,
    currentVersion: number,
    patch: Partial<CreditAccountEntity>,
  ): Promise<void> {
    const result = await manager
      .getRepository(CreditAccountEntity)
      .createQueryBuilder()
      .update()
      .set({ ...patch, version: () => 'version + 1' })
      .where('id = :id AND version = :version', {
        id: accountId,
        version: currentVersion,
      })
      .execute();
    if (result.affected === 0) {
      BusinessException.throw(
        ErrorCode.INTERNAL_ERROR,
        '积分账户并发更新失败，请重试',
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 健康检查（保留兼容） */
  health() {
    return { status: 'ok', module: 'credits' };
  }
}
