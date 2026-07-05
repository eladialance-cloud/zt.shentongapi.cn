"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const credit_account_entity_1 = require("../entities/credit-account.entity");
const credit_transaction_entity_1 = require("../entities/credit-transaction.entity");
const redis_service_1 = require("../../../common/services/redis.service");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
const LOCK_RETRY = 5;
const LOCK_TTL_SECONDS = 30;
const LOCK_RETRY_INTERVAL_MS = 100;
let CreditsService = class CreditsService {
    accountRepo;
    txnRepo;
    dataSource;
    redis;
    constructor(accountRepo, txnRepo, dataSource, redis) {
        this.accountRepo = accountRepo;
        this.txnRepo = txnRepo;
        this.dataSource = dataSource;
        this.redis = redis;
    }
    async getOrCreateAccount(userId) {
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
    async getAccount(userId) {
        return this.getOrCreateAccount(userId);
    }
    async rechargeCredits(userId, amount, sourceId, remark) {
        if (amount <= 0) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '充值金额必须大于 0');
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
                const txn = manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).create({
                    userId,
                    type: 'recharge',
                    amount,
                    balanceBefore,
                    balanceAfter,
                    source: 'recharge',
                    sourceId,
                    remark,
                });
                return manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).save(txn);
            });
        });
    }
    async rewardCredits(userId, amount, source, sourceId, remark) {
        if (amount <= 0) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '奖励金额必须大于 0');
        }
        return this.withLock(userId, async () => {
            return this.dataSource.transaction(async (manager) => {
                const account = await this.getOrCreateAccountLocked(manager, userId);
                const balanceBefore = account.balance;
                const balanceAfter = balanceBefore + amount;
                await this.updateAccountVersioned(manager, account.id, account.version, {
                    balance: balanceAfter,
                });
                const txn = manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).create({
                    userId,
                    type: 'reward',
                    amount,
                    balanceBefore,
                    balanceAfter,
                    source,
                    sourceId,
                    remark,
                });
                return manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).save(txn);
            });
        });
    }
    async adminAdjust(userId, amount, adminId, remark) {
        if (amount === 0) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '调整金额不能为 0');
        }
        return this.withLock(userId, async () => {
            return this.dataSource.transaction(async (manager) => {
                const account = await this.getOrCreateAccountLocked(manager, userId);
                const balanceBefore = account.balance;
                const balanceAfter = balanceBefore + amount;
                if (balanceAfter < 0) {
                    business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '调整后余额不能为负');
                }
                await this.updateAccountVersioned(manager, account.id, account.version, {
                    balance: balanceAfter,
                    totalConsumed: amount < 0 ? account.totalConsumed + Math.abs(amount) : account.totalConsumed,
                });
                const txn = manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).create({
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
                return manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).save(txn);
            });
        });
    }
    async freezeCredits(userId, amount, source, sourceId) {
        if (amount <= 0) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '冻结金额必须大于 0');
        }
        return this.withLock(userId, async () => {
            return this.dataSource.transaction(async (manager) => {
                const account = await this.getOrCreateAccountLocked(manager, userId);
                if (account.balance < amount) {
                    business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '积分余额不足，无法预扣减');
                }
                const balanceBefore = account.balance;
                const balanceAfter = balanceBefore - amount;
                await this.updateAccountVersioned(manager, account.id, account.version, {
                    balance: balanceAfter,
                    frozenBalance: account.frozenBalance + amount,
                });
                const txn = manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).create({
                    userId,
                    type: 'freeze',
                    amount,
                    balanceBefore,
                    balanceAfter,
                    source,
                    sourceId,
                });
                return manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).save(txn);
            });
        });
    }
    async settleCredits(userId, frozenTxnId, actualAmount) {
        if (actualAmount < 0) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '结算金额不能为负');
        }
        return this.withLock(userId, async () => {
            return this.dataSource.transaction(async (manager) => {
                const frozenTxn = await manager
                    .getRepository(credit_transaction_entity_1.CreditTransactionEntity)
                    .findOne({ where: { id: frozenTxnId, userId, type: 'freeze' } });
                if (!frozenTxn) {
                    business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '冻结流水不存在');
                }
                if (frozenTxn.settledAt) {
                    const existing = await manager
                        .getRepository(credit_transaction_entity_1.CreditTransactionEntity)
                        .findOne({ where: { frozenTxnId, type: 'settle' } });
                    return existing;
                }
                const account = await this.getOrCreateAccountLocked(manager, userId);
                const frozenAmount = frozenTxn.amount;
                const diff = actualAmount - frozenAmount;
                const balanceBefore = account.balance;
                let balanceAfter = balanceBefore;
                if (diff > 0) {
                    if (account.balance < diff) {
                        business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '积分余额不足，无法结算补扣');
                    }
                    balanceAfter = balanceBefore - diff;
                }
                else if (diff < 0) {
                    balanceAfter = balanceBefore + Math.abs(diff);
                }
                await this.updateAccountVersioned(manager, account.id, account.version, {
                    balance: balanceAfter,
                    frozenBalance: account.frozenBalance - frozenAmount,
                    totalConsumed: account.totalConsumed + actualAmount,
                });
                frozenTxn.settledAt = new Date();
                await manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).save(frozenTxn);
                const settleTxn = manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).create({
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
                return manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).save(settleTxn);
            });
        });
    }
    async refundCredits(userId, frozenTxnId) {
        return this.withLock(userId, async () => {
            return this.dataSource.transaction(async (manager) => {
                const frozenTxn = await manager
                    .getRepository(credit_transaction_entity_1.CreditTransactionEntity)
                    .findOne({ where: { id: frozenTxnId, userId, type: 'freeze' } });
                if (!frozenTxn) {
                    business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '冻结流水不存在');
                }
                if (frozenTxn.settledAt) {
                    const existing = await manager
                        .getRepository(credit_transaction_entity_1.CreditTransactionEntity)
                        .findOne({ where: { frozenTxnId, type: 'refund' } });
                    return existing;
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
                await manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).save(frozenTxn);
                const refundTxn = manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).create({
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
                return manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).save(refundTxn);
            });
        });
    }
    async getTransactions(userId, query) {
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
    async withLock(userId, fn) {
        const lockKey = `credits:lock:${userId}`;
        const lockValue = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let acquired = false;
        for (let i = 0; i < LOCK_RETRY; i++) {
            acquired = await this.redis.setNx(lockKey, lockValue, LOCK_TTL_SECONDS);
            if (acquired)
                break;
            await this.sleep(LOCK_RETRY_INTERVAL_MS);
        }
        if (!acquired) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '积分操作繁忙，请稍后重试');
        }
        try {
            return await fn();
        }
        finally {
            const current = await this.redis.get(lockKey);
            if (current === lockValue) {
                await this.redis.del(lockKey);
            }
        }
    }
    async getOrCreateAccountLocked(manager, userId) {
        const repo = manager.getRepository(credit_account_entity_1.CreditAccountEntity);
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
    async updateAccountVersioned(manager, accountId, currentVersion, patch) {
        const result = await manager
            .getRepository(credit_account_entity_1.CreditAccountEntity)
            .createQueryBuilder()
            .update()
            .set({ ...patch, version: () => 'version + 1' })
            .where('id = :id AND version = :version', {
            id: accountId,
            version: currentVersion,
        })
            .execute();
        if (result.affected === 0) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.INTERNAL_ERROR, '积分账户并发更新失败，请重试');
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    health() {
        return { status: 'ok', module: 'credits' };
    }
};
exports.CreditsService = CreditsService;
exports.CreditsService = CreditsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(credit_account_entity_1.CreditAccountEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(credit_transaction_entity_1.CreditTransactionEntity)),
    __param(2, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        redis_service_1.RedisService])
], CreditsService);
//# sourceMappingURL=credits.service.js.map