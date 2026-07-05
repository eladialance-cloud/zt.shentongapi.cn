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
exports.CreditTransactionEntity = void 0;
const typeorm_1 = require("typeorm");
let CreditTransactionEntity = class CreditTransactionEntity {
    id;
    userId;
    type;
    amount;
    balanceBefore;
    balanceAfter;
    source;
    sourceId;
    frozenTxnId;
    remark;
    adminId;
    settledAt;
    createdAt;
};
exports.CreditTransactionEntity = CreditTransactionEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], CreditTransactionEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], CreditTransactionEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], CreditTransactionEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], CreditTransactionEntity.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'balance_before', type: 'int' }),
    __metadata("design:type", Number)
], CreditTransactionEntity.prototype, "balanceBefore", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'balance_after', type: 'int' }),
    __metadata("design:type", Number)
], CreditTransactionEntity.prototype, "balanceAfter", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], CreditTransactionEntity.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'source_id', length: 64 }),
    __metadata("design:type", String)
], CreditTransactionEntity.prototype, "sourceId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'frozen_txn_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], CreditTransactionEntity.prototype, "frozenTxnId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], CreditTransactionEntity.prototype, "remark", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'admin_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], CreditTransactionEntity.prototype, "adminId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'settled_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], CreditTransactionEntity.prototype, "settledAt", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], CreditTransactionEntity.prototype, "createdAt", void 0);
exports.CreditTransactionEntity = CreditTransactionEntity = __decorate([
    (0, typeorm_1.Entity)('credit_transactions')
], CreditTransactionEntity);
//# sourceMappingURL=credit-transaction.entity.js.map