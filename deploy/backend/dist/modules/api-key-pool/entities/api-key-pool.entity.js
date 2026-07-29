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
exports.ApiKeyPoolEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let ApiKeyPoolEntity = class ApiKeyPoolEntity extends base_entity_1.BaseEntity {
    modelConfigId;
    provider;
    apiKey;
    alias;
    priority;
    status;
    totalQuota;
    usedQuota;
    remainingQuota;
    dailyQuota;
    monthlyQuota;
    dailyUsedQuota;
    monthlyUsedQuota;
    lastUsedAt;
    lastCheckAt;
    errorCount;
};
exports.ApiKeyPoolEntity = ApiKeyPoolEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'model_config_id', type: 'bigint', nullable: true }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "modelConfigId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], ApiKeyPoolEntity.prototype, "provider", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'api_key', length: 512 }),
    __metadata("design:type", String)
], ApiKeyPoolEntity.prototype, "apiKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: true }),
    __metadata("design:type", String)
], ApiKeyPoolEntity.prototype, "alias", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        length: 16,
        default: 'active',
    }),
    __metadata("design:type", String)
], ApiKeyPoolEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_quota', type: 'decimal', precision: 12, scale: 4 }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "totalQuota", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'used_quota', type: 'decimal', precision: 12, scale: 4, default: 0 }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "usedQuota", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'remaining_quota', type: 'decimal', precision: 12, scale: 4 }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "remainingQuota", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'daily_quota', type: 'decimal', precision: 12, scale: 4, nullable: true }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "dailyQuota", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'monthly_quota', type: 'decimal', precision: 12, scale: 4, nullable: true }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "monthlyQuota", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'daily_used_quota', type: 'decimal', precision: 12, scale: 4, default: 0 }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "dailyUsedQuota", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'monthly_used_quota', type: 'decimal', precision: 12, scale: 4, default: 0 }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "monthlyUsedQuota", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_used_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], ApiKeyPoolEntity.prototype, "lastUsedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_check_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], ApiKeyPoolEntity.prototype, "lastCheckAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ApiKeyPoolEntity.prototype, "errorCount", void 0);
exports.ApiKeyPoolEntity = ApiKeyPoolEntity = __decorate([
    (0, typeorm_1.Entity)('api_key_pool')
], ApiKeyPoolEntity);
//# sourceMappingURL=api-key-pool.entity.js.map