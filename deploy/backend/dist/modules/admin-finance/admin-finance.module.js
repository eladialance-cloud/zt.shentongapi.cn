"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminFinanceModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const credit_transaction_entity_1 = require("../credits/entities/credit-transaction.entity");
const recharge_order_entity_1 = require("../payment/entities/recharge-order.entity");
const payment_record_entity_1 = require("../payment/entities/payment-record.entity");
const reconciliation_diff_entity_1 = require("../reconciliation/entities/reconciliation-diff.entity");
const user_entity_1 = require("../user/entities/user.entity");
const invoice_entity_1 = require("./entities/invoice.entity");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const admin_finance_controller_1 = require("./admin-finance.controller");
const admin_finance_service_1 = require("./admin-finance.service");
let AdminFinanceModule = class AdminFinanceModule {
};
exports.AdminFinanceModule = AdminFinanceModule;
exports.AdminFinanceModule = AdminFinanceModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                credit_transaction_entity_1.CreditTransactionEntity,
                recharge_order_entity_1.RechargeOrderEntity,
                payment_record_entity_1.PaymentRecordEntity,
                reconciliation_diff_entity_1.ReconciliationDiffEntity,
                user_entity_1.UserEntity,
                invoice_entity_1.InvoiceEntity,
            ]),
            admin_auth_module_1.AdminAuthModule,
        ],
        controllers: [admin_finance_controller_1.AdminFinanceController],
        providers: [admin_finance_service_1.AdminFinanceService],
        exports: [admin_finance_service_1.AdminFinanceService],
    })
], AdminFinanceModule);
//# sourceMappingURL=admin-finance.module.js.map