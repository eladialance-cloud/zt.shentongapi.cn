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
exports.AdminFinanceService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const credit_transaction_entity_1 = require("../credits/entities/credit-transaction.entity");
const recharge_order_entity_1 = require("../payment/entities/recharge-order.entity");
const payment_record_entity_1 = require("../payment/entities/payment-record.entity");
const reconciliation_diff_entity_1 = require("../reconciliation/entities/reconciliation-diff.entity");
const user_entity_1 = require("../user/entities/user.entity");
const invoice_entity_1 = require("./entities/invoice.entity");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
function parsePaging(page, pageSize) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return { page: p, pageSize: ps };
}
function paginate(list, total, page, pageSize) {
    return {
        list,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}
let AdminFinanceService = class AdminFinanceService {
    txnRepo;
    orderRepo;
    paymentRepo;
    diffRepo;
    invoiceRepo;
    userRepo;
    constructor(txnRepo, orderRepo, paymentRepo, diffRepo, invoiceRepo, userRepo) {
        this.txnRepo = txnRepo;
        this.orderRepo = orderRepo;
        this.paymentRepo = paymentRepo;
        this.diffRepo = diffRepo;
        this.invoiceRepo = invoiceRepo;
        this.userRepo = userRepo;
    }
    async listTransactions(query) {
        const { page, pageSize } = parsePaging(query.page, query.pageSize);
        const qb = this.txnRepo.createQueryBuilder('t');
        if (query.userId) {
            qb.andWhere('t.user_id = :uid', { uid: query.userId });
        }
        if (query.type) {
            qb.andWhere('t.type = :type', { type: query.type });
        }
        if (query.source) {
            qb.andWhere('t.source = :source', { source: query.source });
        }
        if (query.startTime) {
            qb.andWhere('t.created_at >= :start', { start: query.startTime });
        }
        if (query.endTime) {
            qb.andWhere('t.created_at <= :end', { end: query.endTime });
        }
        qb.orderBy('t.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        const userMap = await this.batchUsernames(items.map((i) => i.userId));
        return paginate(items.map((t) => this.toCreditTransaction(t, userMap.get(t.userId))), total, page, pageSize);
    }
    async getTransactionDetail(id) {
        const txn = await this.txnRepo.findOne({ where: { id } });
        if (!txn) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '流水不存在');
        }
        const username = await this.getUsername(txn.userId);
        return this.toCreditTransaction(txn, username);
    }
    async getTransactionStats(query) {
        const qb = this.txnRepo.createQueryBuilder('t');
        if (query.userId) {
            qb.andWhere('t.user_id = :uid', { uid: query.userId });
        }
        if (query.type) {
            qb.andWhere('t.type = :type', { type: query.type });
        }
        if (query.startTime) {
            qb.andWhere('t.created_at >= :start', { start: query.startTime });
        }
        if (query.endTime) {
            qb.andWhere('t.created_at <= :end', { end: query.endTime });
        }
        const total = await qb.getCount();
        const income = await qb
            .andWhere('t.amount > 0')
            .select('COALESCE(SUM(t.amount),0)', 'sum')
            .getRawOne();
        const outcome = await qb
            .andWhere('t.amount < 0')
            .select('COALESCE(SUM(t.amount),0)', 'sum')
            .getRawOne();
        return {
            total,
            totalIncome: Number(income?.sum || 0),
            totalOutcome: Number(outcome?.sum || 0),
        };
    }
    async listOrders(query) {
        const { page, pageSize } = parsePaging(query.page, query.pageSize);
        const qb = this.orderRepo.createQueryBuilder('o');
        if (query.status) {
            qb.andWhere('o.status = :status', { status: query.status });
        }
        if (query.paymentMethod && query.paymentMethod !== 'other') {
            qb.andWhere('o.payment_channel = :ch', { ch: query.paymentMethod });
        }
        if (query.startTime) {
            qb.andWhere('o.created_at >= :start', { start: query.startTime });
        }
        if (query.endTime) {
            qb.andWhere('o.created_at <= :end', { end: query.endTime });
        }
        qb.orderBy('o.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        const userMap = await this.batchUsernames(items.map((i) => i.userId));
        const list = await Promise.all(items.map(async (o) => {
            const payment = o.paymentRecordId
                ? await this.paymentRepo.findOne({ where: { id: o.paymentRecordId } })
                : null;
            return this.toFinanceRechargeOrder(o, payment, userMap.get(o.userId));
        }));
        return paginate(list, total, page, pageSize);
    }
    async getOrderDetail(id) {
        const order = await this.orderRepo.findOne({ where: { id } });
        if (!order) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '订单不存在');
        }
        const payment = order.paymentRecordId
            ? await this.paymentRepo.findOne({ where: { id: order.paymentRecordId } })
            : null;
        const username = await this.getUsername(order.userId);
        return this.toFinanceRechargeOrder(order, payment, username);
    }
    async refundOrder(id, dto) {
        const order = await this.orderRepo.findOne({ where: { id } });
        if (!order) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '订单不存在');
        }
        if (order.status !== 'paid') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '仅已支付订单可退款');
        }
        order.status = 'refunded';
        await this.orderRepo.save(order);
        if (order.paymentRecordId) {
            const payment = await this.paymentRepo.findOne({
                where: { id: order.paymentRecordId },
            });
            if (payment) {
                payment.status = 'refunded';
                payment.refundAmount = order.amount;
                payment.refundedAt = new Date();
                await this.paymentRepo.save(payment);
            }
        }
    }
    async listInvoices(query) {
        const { page, pageSize } = parsePaging(query.page, query.pageSize);
        const qb = this.invoiceRepo.createQueryBuilder('i');
        if (query.status) {
            qb.andWhere('i.status = :status', { status: query.status });
        }
        qb.orderBy('i.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        const userMap = await this.batchUsernames(items.map((i) => i.userId));
        return paginate(items.map((inv) => this.toInvoiceItem(inv, userMap.get(inv.userId))), total, page, pageSize);
    }
    async getInvoiceDetail(id) {
        const inv = await this.invoiceRepo.findOne({ where: { id } });
        if (!inv) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '发票不存在');
        }
        const username = await this.getUsername(inv.userId);
        return this.toInvoiceItem(inv, username);
    }
    async issueInvoice(id, dto) {
        const inv = await this.invoiceRepo.findOne({ where: { id } });
        if (!inv) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '发票不存在');
        }
        inv.status = 'issued';
        inv.invoiceNumber = dto.invoiceNumber;
        inv.invoiceUrl = dto.invoiceUrl;
        inv.issuedAt = new Date();
        await this.invoiceRepo.save(inv);
    }
    async rejectInvoice(id, dto) {
        const inv = await this.invoiceRepo.findOne({ where: { id } });
        if (!inv) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '发票不存在');
        }
        inv.status = 'rejected';
        inv.rejectReason = dto.reason;
        await this.invoiceRepo.save(inv);
    }
    async auditInvoice(id, dto) {
        if (dto.action === 'issue') {
            await this.issueInvoice(id, {
                invoiceNumber: dto.invoiceNumber || '',
                invoiceUrl: dto.invoiceUrl,
            });
        }
        else if (dto.action === 'reject') {
            await this.rejectInvoice(id, { reason: dto.reason || '' });
        }
    }
    async listReconciliationDiffs(query) {
        const { page, pageSize } = parsePaging(query.page, query.pageSize);
        const qb = this.diffRepo.createQueryBuilder('d');
        if (query.type) {
            qb.andWhere('d.type = :type', { type: query.type });
        }
        if (query.status) {
            qb.andWhere('d.status = :status', { status: query.status });
        }
        qb.orderBy('d.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        const userIds = items
            .map((i) => i.userId)
            .filter((u) => u !== null && u !== undefined);
        const userMap = await this.batchUsernames(userIds);
        return paginate(items.map((d) => this.toReconciliationDiff(d, d.userId ? userMap.get(d.userId) : undefined)), total, page, pageSize);
    }
    async getReconciliationStats(query) {
        const qb = this.diffRepo.createQueryBuilder('d');
        if (query.type) {
            qb.andWhere('d.type = :type', { type: query.type });
        }
        const total = await qb.getCount();
        const pending = await qb.andWhere('d.status = :s', { s: 'pending' }).getCount();
        const resolved = await qb
            .andWhere('d.status = :s', { s: 'resolved' })
            .getCount();
        const ignored = await qb
            .andWhere('d.status = :s', { s: 'ignored' })
            .getCount();
        const sumRow = await qb
            .select('COALESCE(SUM(d.diff_amount),0)', 'sum')
            .getRawOne();
        return {
            total,
            pending,
            resolved,
            ignored,
            totalDiffAmount: Number(sumRow?.sum || 0),
        };
    }
    async adjustReconciliationDiff(id, dto) {
        const diff = await this.diffRepo.findOne({ where: { id } });
        if (!diff) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '对账差异不存在');
        }
        diff.diffAmount = dto.amount;
        diff.remark = dto.remark;
        diff.status = 'resolved';
        diff.resolvedAt = new Date();
        await this.diffRepo.save(diff);
    }
    async ignoreReconciliationDiff(id) {
        const diff = await this.diffRepo.findOne({ where: { id } });
        if (!diff) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '对账差异不存在');
        }
        diff.status = 'ignored';
        diff.resolvedAt = new Date();
        await this.diffRepo.save(diff);
    }
    async getDashboard() {
        const totalOrders = await this.orderRepo.count();
        const paidOrders = await this.orderRepo.count({
            where: { status: 'paid' },
        });
        const refundedOrders = await this.orderRepo.count({
            where: { status: 'refunded' },
        });
        const revenueRow = await this.orderRepo
            .createQueryBuilder('o')
            .where('o.status = :s', { s: 'paid' })
            .select('COALESCE(SUM(o.amount),0)', 'sum')
            .getRawOne();
        const totalTransactions = await this.txnRepo.count();
        const pendingInvoices = await this.invoiceRepo.count({
            where: { status: 'pending' },
        });
        const pendingDiffs = await this.diffRepo.count({
            where: { status: 'pending' },
        });
        return {
            orderStats: {
                total: totalOrders,
                paid: paidOrders,
                refunded: refundedOrders,
            },
            totalRevenue: Number(revenueRow?.sum || 0),
            totalTransactions,
            pendingInvoices,
            pendingDiffs,
        };
    }
    async batchUsernames(userIds) {
        const ids = [...new Set(userIds.filter((id) => id !== null && id !== undefined))];
        if (ids.length === 0)
            return new Map();
        const users = await this.userRepo
            .createQueryBuilder('u')
            .select(['u.id', 'u.username'])
            .where('u.id IN (:...ids)', { ids })
            .getMany();
        return new Map(users.map((u) => [u.id, u.username]));
    }
    async getUsername(userId) {
        const map = await this.batchUsernames([userId]);
        return map.get(userId);
    }
    toCreditTransaction(t, username) {
        return {
            id: t.id,
            txNo: t.sourceId,
            userId: t.userId,
            username,
            type: t.type,
            source: t.source,
            amount: t.amount,
            balanceBefore: t.balanceBefore,
            balanceAfter: t.balanceAfter,
            relatedId: t.frozenTxnId !== null && t.frozenTxnId !== undefined
                ? String(t.frozenTxnId)
                : undefined,
            remark: t.remark,
            createdAt: t.createdAt,
        };
    }
    toFinanceRechargeOrder(o, payment, username) {
        return {
            id: o.id,
            orderNo: o.orderNo,
            userId: o.userId,
            username,
            amount: Number(o.amount),
            credits: o.credits,
            paymentMethod: o.paymentChannel || payment?.channel || 'other',
            status: o.status,
            createdAt: o.createdAt,
            paidAt: payment?.paidAt,
            refundedAt: payment?.refundedAt,
        };
    }
    toInvoiceItem(inv, username) {
        return {
            id: inv.id,
            applyNo: inv.applyNo,
            userId: inv.userId,
            username,
            orderNo: inv.orderNo,
            invoiceType: inv.invoiceType,
            title: inv.title,
            taxNo: inv.taxNo,
            amount: Number(inv.amount),
            status: inv.status,
            invoiceNumber: inv.invoiceNumber,
            invoiceUrl: inv.invoiceUrl,
            rejectReason: inv.rejectReason,
            createdAt: inv.createdAt,
            issuedAt: inv.issuedAt,
        };
    }
    toReconciliationDiff(d, username) {
        return {
            id: d.id,
            type: d.type,
            userId: d.userId,
            username,
            diffAmount: Number(d.diffAmount),
            detail: d.detail ? JSON.stringify(d.detail) : '',
            status: d.status,
            createdAt: d.createdAt,
            resolvedAt: d.resolvedAt,
            resolveRemark: d.remark,
        };
    }
};
exports.AdminFinanceService = AdminFinanceService;
exports.AdminFinanceService = AdminFinanceService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(credit_transaction_entity_1.CreditTransactionEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(recharge_order_entity_1.RechargeOrderEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(payment_record_entity_1.PaymentRecordEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(reconciliation_diff_entity_1.ReconciliationDiffEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(invoice_entity_1.InvoiceEntity)),
    __param(5, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], AdminFinanceService);
//# sourceMappingURL=admin-finance.service.js.map