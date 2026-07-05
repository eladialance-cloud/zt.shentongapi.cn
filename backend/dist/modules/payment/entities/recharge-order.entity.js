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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeOrderEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let RechargeOrderEntity = class RechargeOrderEntity extends base_entity_1.BaseEntity {
    orderNo;
    userId;
    packageId;
    credits;
    amount;
    status;
    paymentChannel;
    paymentRecordId;
};
exports.RechargeOrderEntity = RechargeOrderEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'order_no', length: 64 }),
    __metadata("design:type", String)
], RechargeOrderEntity.prototype, "orderNo", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], RechargeOrderEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'package_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], RechargeOrderEntity.prototype, "packageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], RechargeOrderEntity.prototype, "credits", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], RechargeOrderEntity.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], RechargeOrderEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payment_channel', type: 'enum', enum: ['wechat', 'alipay', 'stripe'], nullable: true }),
    __metadata("design:type", String)
], RechargeOrderEntity.prototype, "paymentChannel", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'payment_record_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], RechargeOrderEntity.prototype, "paymentRecordId", void 0);
exports.RechargeOrderEntity = RechargeOrderEntity = __decorate([
    (0, typeorm_1.Entity)('recharge_orders')
], RechargeOrderEntity);
//# sourceMappingURL=recharge-order.entity.js.map