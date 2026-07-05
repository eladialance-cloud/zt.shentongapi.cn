"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const membership_plan_entity_1 = require("./entities/membership-plan.entity");
const payment_record_entity_1 = require("./entities/payment-record.entity");
const recharge_order_entity_1 = require("./entities/recharge-order.entity");
const revenue_record_entity_1 = require("./entities/revenue-record.entity");
const withdrawal_record_entity_1 = require("./entities/withdrawal-record.entity");
const payment_controller_1 = require("./controllers/payment.controller");
const payment_service_1 = require("./services/payment.service");
let PaymentModule = class PaymentModule {
};
exports.PaymentModule = PaymentModule;
exports.PaymentModule = PaymentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                membership_plan_entity_1.MembershipPlanEntity,
                payment_record_entity_1.PaymentRecordEntity,
                recharge_order_entity_1.RechargeOrderEntity,
                revenue_record_entity_1.RevenueRecordEntity,
                withdrawal_record_entity_1.WithdrawalRecordEntity,
            ]),
        ],
        controllers: [payment_controller_1.PaymentController],
        providers: [payment_service_1.PaymentService],
        exports: [payment_service_1.PaymentService],
    })
], PaymentModule);
//# sourceMappingURL=payment.module.js.map