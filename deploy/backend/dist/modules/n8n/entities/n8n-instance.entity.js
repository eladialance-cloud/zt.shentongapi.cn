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
exports.N8nInstanceEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let N8nInstanceEntity = class N8nInstanceEntity extends base_entity_1.BaseEntity {
    userId;
    name;
    description;
    baseUrl;
    apiKey;
    status;
    version;
    lastStartedAt;
    lastStoppedAt;
    webhookUrl;
    config;
};
exports.N8nInstanceEntity = N8nInstanceEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', unsigned: true }),
    __metadata("design:type", Number)
], N8nInstanceEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], N8nInstanceEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], N8nInstanceEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'base_url', length: 512 }),
    __metadata("design:type", String)
], N8nInstanceEntity.prototype, "baseUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'api_key', length: 256 }),
    __metadata("design:type", String)
], N8nInstanceEntity.prototype, "apiKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32, default: 'pending' }),
    __metadata("design:type", String)
], N8nInstanceEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32, nullable: true }),
    __metadata("design:type", String)
], N8nInstanceEntity.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_started_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], N8nInstanceEntity.prototype, "lastStartedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_stopped_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], N8nInstanceEntity.prototype, "lastStoppedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'webhook_url', length: 512, nullable: true }),
    __metadata("design:type", String)
], N8nInstanceEntity.prototype, "webhookUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], N8nInstanceEntity.prototype, "config", void 0);
exports.N8nInstanceEntity = N8nInstanceEntity = __decorate([
    (0, typeorm_1.Entity)('n8n_instances')
], N8nInstanceEntity);
//# sourceMappingURL=n8n-instance.entity.js.map