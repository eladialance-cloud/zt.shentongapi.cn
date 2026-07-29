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
exports.AdminFinanceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_finance_service_1 = require("./admin-finance.service");
const transaction_query_dto_1 = require("./dto/transaction-query.dto");
const order_query_dto_1 = require("./dto/order-query.dto");
const invoice_query_dto_1 = require("./dto/invoice-query.dto");
const reconciliation_query_dto_1 = require("./dto/reconciliation-query.dto");
const refund_dto_1 = require("./dto/refund.dto");
const issue_invoice_dto_1 = require("./dto/issue-invoice.dto");
const reject_invoice_dto_1 = require("./dto/reject-invoice.dto");
const invoice_audit_dto_1 = require("./dto/invoice-audit.dto");
const adjust_reconciliation_dto_1 = require("./dto/adjust-reconciliation.dto");
let AdminFinanceController = class AdminFinanceController {
    service;
    constructor(service) {
        this.service = service;
    }
    async listTransactions(query) {
        return this.service.listTransactions(query);
    }
    async transactionStats(query) {
        return this.service.getTransactionStats(query);
    }
    async transactionDetail(id) {
        return this.service.getTransactionDetail(id);
    }
    async listOrders(query) {
        return this.service.listOrders(query);
    }
    async orderDetail(id) {
        return this.service.getOrderDetail(id);
    }
    async refundOrder(id, dto) {
        await this.service.refundOrder(id, dto);
    }
    async listInvoices(query) {
        return this.service.listInvoices(query);
    }
    async invoiceDetail(id) {
        return this.service.getInvoiceDetail(id);
    }
    async issueInvoice(id, dto) {
        await this.service.issueInvoice(id, dto);
    }
    async rejectInvoice(id, dto) {
        await this.service.rejectInvoice(id, dto);
    }
    async auditInvoice(id, dto) {
        await this.service.auditInvoice(id, dto);
    }
    async listReconciliationDiffs(query) {
        return this.service.listReconciliationDiffs(query);
    }
    async reconciliationStats(query) {
        return this.service.getReconciliationStats(query);
    }
    async adjustDiff(id, dto) {
        await this.service.adjustReconciliationDiff(id, dto);
    }
    async ignoreDiff(id) {
        await this.service.ignoreReconciliationDiff(id);
    }
    async dashboard() {
        return this.service.getDashboard();
    }
};
exports.AdminFinanceController = AdminFinanceController;
__decorate([
    (0, common_1.Get)('credits/transactions'),
    (0, swagger_1.ApiOperation)({ summary: '积分流水列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [transaction_query_dto_1.TransactionQueryDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "listTransactions", null);
__decorate([
    (0, common_1.Get)('credits/transactions/stats'),
    (0, swagger_1.ApiOperation)({ summary: '积分流水统计' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [transaction_query_dto_1.TransactionQueryDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "transactionStats", null);
__decorate([
    (0, common_1.Get)('credits/transactions/:id'),
    (0, swagger_1.ApiOperation)({ summary: '积分流水详情' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "transactionDetail", null);
__decorate([
    (0, common_1.Get)('recharge-orders'),
    (0, swagger_1.ApiOperation)({ summary: '充值订单列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [order_query_dto_1.OrderQueryDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Get)('recharge-orders/:id'),
    (0, swagger_1.ApiOperation)({ summary: '充值订单详情' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "orderDetail", null);
__decorate([
    (0, common_1.Post)('recharge-orders/:id/refund'),
    (0, swagger_1.ApiOperation)({ summary: '订单退款' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, refund_dto_1.RefundDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "refundOrder", null);
__decorate([
    (0, common_1.Get)('invoices'),
    (0, swagger_1.ApiOperation)({ summary: '发票列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [invoice_query_dto_1.InvoiceQueryDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "listInvoices", null);
__decorate([
    (0, common_1.Get)('invoices/:id'),
    (0, swagger_1.ApiOperation)({ summary: '发票详情' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "invoiceDetail", null);
__decorate([
    (0, common_1.Post)('invoices/:id/issue'),
    (0, swagger_1.ApiOperation)({ summary: '开具发票' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, issue_invoice_dto_1.IssueInvoiceDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "issueInvoice", null);
__decorate([
    (0, common_1.Post)('invoices/:id/reject'),
    (0, swagger_1.ApiOperation)({ summary: '驳回发票' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, reject_invoice_dto_1.RejectInvoiceDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "rejectInvoice", null);
__decorate([
    (0, common_1.Post)('invoices/:id/audit'),
    (0, swagger_1.ApiOperation)({ summary: '发票审核（action=issue/reject）' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, invoice_audit_dto_1.InvoiceAuditDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "auditInvoice", null);
__decorate([
    (0, common_1.Get)('reconciliation/diffs'),
    (0, swagger_1.ApiOperation)({ summary: '对账差异列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reconciliation_query_dto_1.ReconciliationQueryDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "listReconciliationDiffs", null);
__decorate([
    (0, common_1.Get)('reconciliation/stats'),
    (0, swagger_1.ApiOperation)({ summary: '对账差异统计' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reconciliation_query_dto_1.ReconciliationQueryDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "reconciliationStats", null);
__decorate([
    (0, common_1.Post)('reconciliation/:id/adjust'),
    (0, swagger_1.ApiOperation)({ summary: '手动调整差异' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, adjust_reconciliation_dto_1.AdjustReconciliationDto]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "adjustDiff", null);
__decorate([
    (0, common_1.Post)('reconciliation/:id/ignore'),
    (0, swagger_1.ApiOperation)({ summary: '标记忽略差异' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "ignoreDiff", null);
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, swagger_1.ApiOperation)({ summary: '财务仪表盘' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminFinanceController.prototype, "dashboard", null);
exports.AdminFinanceController = AdminFinanceController = __decorate([
    (0, swagger_1.ApiTags)('管理端-积分财务'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_finance_service_1.AdminFinanceService])
], AdminFinanceController);
//# sourceMappingURL=admin-finance.controller.js.map