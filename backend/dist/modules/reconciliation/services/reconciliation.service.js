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
var ReconciliationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const reconciliation_diff_entity_1 = require("../entities/reconciliation-diff.entity");
const credits_service_1 = require("../../credits/services/credits.service");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let ReconciliationService = ReconciliationService_1 = class ReconciliationService {
    diffRepo;
    dataSource;
    creditsService;
    logger = new common_1.Logger(ReconciliationService_1.name);
    constructor(diffRepo, dataSource, creditsService) {
        this.diffRepo = diffRepo;
        this.dataSource = dataSource;
        this.creditsService = creditsService;
    }
    onModuleInit() {
        this.scheduleDaily(2, 0, () => {
            this.runAllReconciliations().catch((err) => this.logger.error(`每日对账失败: ${err?.message || err}`));
        });
    }
    async reconcileBalanceVsTransactions() {
        const diffs = [];
        const rows = await this.dataSource.query(`
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
    async reconcileTokenUsage() {
        const diffs = [];
        try {
            const rows = await this.dataSource.query(`
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
        }
        catch (err) {
            this.logger.warn(`Token 用量对账跳过（表可能不存在）: ${err.message}`);
        }
        return diffs;
    }
    async reconcilePaymentVsOrders() {
        const diffs = [];
        const rows = await this.dataSource.query(`
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
    async reconcileApiKeyPoolDeduction() {
        const diffs = [];
        try {
            const rows = await this.dataSource.query(`
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
        }
        catch (err) {
            this.logger.warn(`Key 池对账跳过（表可能不存在）: ${err.message}`);
        }
        return diffs;
    }
    async runAllReconciliations() {
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
    async getDiffs(query) {
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
    async adjustDiff(diffId, adminId, amount, remark) {
        const diff = await this.diffRepo.findOne({ where: { id: diffId } });
        if (!diff) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '对账差异不存在');
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
    async ignoreDiff(diffId, adminId, remark) {
        const diff = await this.diffRepo.findOne({ where: { id: diffId } });
        if (!diff) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '对账差异不存在');
        }
        diff.status = 'ignored';
        diff.resolvedBy = adminId;
        diff.resolvedAt = new Date();
        diff.remark = remark || diff.remark;
        return this.diffRepo.save(diff);
    }
    health() {
        return { status: 'ok', module: 'reconciliation' };
    }
    scheduleDaily(hour, minute, fn) {
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
};
exports.ReconciliationService = ReconciliationService;
exports.ReconciliationService = ReconciliationService = ReconciliationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(reconciliation_diff_entity_1.ReconciliationDiffEntity)),
    __param(1, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.DataSource,
        credits_service_1.CreditsService])
], ReconciliationService);
//# sourceMappingURL=reconciliation.service.js.map