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
exports.CreditAccountEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let CreditAccountEntity = class CreditAccountEntity extends base_entity_1.BaseEntity {
    userId;
    balance;
    frozenBalance;
    totalRecharged;
    totalConsumed;
    version;
};
exports.CreditAccountEntity = CreditAccountEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], CreditAccountEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], CreditAccountEntity.prototype, "balance", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'frozen_balance', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], CreditAccountEntity.prototype, "frozenBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_recharged', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], CreditAccountEntity.prototype, "totalRecharged", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_consumed', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], CreditAccountEntity.prototype, "totalConsumed", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], CreditAccountEntity.prototype, "version", void 0);
exports.CreditAccountEntity = CreditAccountEntity = __decorate([
    (0, typeorm_1.Entity)('credit_accounts')
], CreditAccountEntity);
//# sourceMappingURL=credit-account.entity.js.map