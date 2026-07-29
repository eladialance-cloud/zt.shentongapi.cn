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
exports.ReconciliationDiffEntity = void 0;
const typeorm_1 = require("typeorm");
let ReconciliationDiffEntity = class ReconciliationDiffEntity {
    id;
    type;
    userId;
    diffAmount;
    detail;
    status;
    resolvedBy;
    resolvedAt;
    remark;
    createdAt;
};
exports.ReconciliationDiffEntity = ReconciliationDiffEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], ReconciliationDiffEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], ReconciliationDiffEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], ReconciliationDiffEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'diff_amount', type: 'decimal', precision: 12, scale: 4 }),
    __metadata("design:type", Number)
], ReconciliationDiffEntity.prototype, "diffAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], ReconciliationDiffEntity.prototype, "detail", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        length: 16,
        default: 'pending',
    }),
    __metadata("design:type", String)
], ReconciliationDiffEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'resolved_by', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], ReconciliationDiffEntity.prototype, "resolvedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'resolved_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], ReconciliationDiffEntity.prototype, "resolvedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], ReconciliationDiffEntity.prototype, "remark", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], ReconciliationDiffEntity.prototype, "createdAt", void 0);
exports.ReconciliationDiffEntity = ReconciliationDiffEntity = __decorate([
    (0, typeorm_1.Entity)('reconciliation_diff')
], ReconciliationDiffEntity);
//# sourceMappingURL=reconciliation-diff.entity.js.map