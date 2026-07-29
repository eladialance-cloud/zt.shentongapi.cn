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
exports.PaymentRecordEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let PaymentRecordEntity = class PaymentRecordEntity extends base_entity_1.BaseEntity {
    userId;
    orderNo;
    channel;
    subMethod;
    amount;
    currency;
    status;
    paymentTxnId;
    payParams;
    paidAt;
    refundTxnId;
    refundAmount;
    refundedAt;
    description;
    callbackRaw;
};
exports.PaymentRecordEntity = PaymentRecordEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], PaymentRecordEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'order_no', length: 64 }),
    __metadata("design:type", String)
], PaymentRecordEntity.prototype, "orderNo", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['wechat', 'alipay', 'stripe'],
    }),
    __metadata("design:type", String)
], PaymentRecordEntity.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sub_method', length: 32, nullable: true }),
    __metadata("design:type", String)
], PaymentRecordEntity.prototype, "subMethod", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], PaymentRecordEntity.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 8, default: 'CNY' }),
    __metadata("design:type", String)
], PaymentRecordEntity.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['pending', 'paid', 'failed', 'refunded', 'refunding'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], PaymentRecordEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'payment_txn_id', length: 128, nullable: true }),
    __metadata("design:type", String)
], PaymentRecordEntity.prototype, "paymentTxnId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'pay_params', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], PaymentRecordEntity.prototype, "payParams", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'paid_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], PaymentRecordEntity.prototype, "paidAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'refund_txn_id', length: 128, nullable: true }),
    __metadata("design:type", String)
], PaymentRecordEntity.prototype, "refundTxnId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'refund_amount', type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], PaymentRecordEntity.prototype, "refundAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'refunded_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], PaymentRecordEntity.prototype, "refundedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 256, nullable: true }),
    __metadata("design:type", String)
], PaymentRecordEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'callback_raw', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], PaymentRecordEntity.prototype, "callbackRaw", void 0);
exports.PaymentRecordEntity = PaymentRecordEntity = __decorate([
    (0, typeorm_1.Entity)('payment_records')
], PaymentRecordEntity);
//# sourceMappingURL=payment-record.entity.js.map