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
exports.RevenueRecordEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let RevenueRecordEntity = class RevenueRecordEntity extends base_entity_1.BaseEntity {
    userId;
    source;
    amount;
    referenceId;
    description;
};
exports.RevenueRecordEntity = RevenueRecordEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], RevenueRecordEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['agent_sale', 'recharge', 'referral', 'withdrawal', 'adjustment'],
    }),
    __metadata("design:type", String)
], RevenueRecordEntity.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], RevenueRecordEntity.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reference_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], RevenueRecordEntity.prototype, "referenceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], RevenueRecordEntity.prototype, "description", void 0);
exports.RevenueRecordEntity = RevenueRecordEntity = __decorate([
    (0, typeorm_1.Entity)('revenue_records')
], RevenueRecordEntity);
//# sourceMappingURL=revenue-record.entity.js.map