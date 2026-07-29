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
exports.HermesInstanceEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let HermesInstanceEntity = class HermesInstanceEntity extends base_entity_1.BaseEntity {
    userId;
    name;
    status;
    pid;
    skillCount;
    skillIds;
    errorMessage;
    cpuPercent;
    memoryUsedMb;
    memoryTotalMb;
    startedAt;
};
exports.HermesInstanceEntity = HermesInstanceEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], HermesInstanceEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], HermesInstanceEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['running', 'stopped', 'error'],
        default: 'stopped',
    }),
    __metadata("design:type", String)
], HermesInstanceEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'pid', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], HermesInstanceEntity.prototype, "pid", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'skill_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], HermesInstanceEntity.prototype, "skillCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'skill_ids', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], HermesInstanceEntity.prototype, "skillIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_message', length: 512, nullable: true }),
    __metadata("design:type", String)
], HermesInstanceEntity.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'cpu_percent', type: 'decimal', precision: 5, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], HermesInstanceEntity.prototype, "cpuPercent", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'memory_used_mb', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], HermesInstanceEntity.prototype, "memoryUsedMb", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'memory_total_mb', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], HermesInstanceEntity.prototype, "memoryTotalMb", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'started_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], HermesInstanceEntity.prototype, "startedAt", void 0);
exports.HermesInstanceEntity = HermesInstanceEntity = __decorate([
    (0, typeorm_1.Entity)('hermes_instances')
], HermesInstanceEntity);
//# sourceMappingURL=hermes-instance.entity.js.map