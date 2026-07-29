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
exports.WithdrawalRecordEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let WithdrawalRecordEntity = class WithdrawalRecordEntity extends base_entity_1.BaseEntity {
    userId;
    amount;
    status;
    channel;
    accountInfo;
    rejectedReason;
    paidAt;
};
exports.WithdrawalRecordEntity = WithdrawalRecordEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], WithdrawalRecordEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], WithdrawalRecordEntity.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['pending', 'approved', 'rejected', 'paid'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], WithdrawalRecordEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32, nullable: true }),
    __metadata("design:type", String)
], WithdrawalRecordEntity.prototype, "channel", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'account_info', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], WithdrawalRecordEntity.prototype, "accountInfo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rejected_reason', length: 512, nullable: true }),
    __metadata("design:type", String)
], WithdrawalRecordEntity.prototype, "rejectedReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'paid_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], WithdrawalRecordEntity.prototype, "paidAt", void 0);
exports.WithdrawalRecordEntity = WithdrawalRecordEntity = __decorate([
    (0, typeorm_1.Entity)('withdrawal_records')
], WithdrawalRecordEntity);
//# sourceMappingURL=withdrawal-record.entity.js.map