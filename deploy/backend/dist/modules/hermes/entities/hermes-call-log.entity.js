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
exports.HermesCallLogEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let HermesCallLogEntity = class HermesCallLogEntity {
    id;
    instanceId;
    userId;
    callType;
    status;
    durationMs;
    creditsCost;
    target;
    errorMessage;
    createdAt;
};
exports.HermesCallLogEntity = HermesCallLogEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], HermesCallLogEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_hermes_call_logs_instance_id'),
    (0, typeorm_1.Column)({ name: 'instance_id', type: 'bigint', transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], HermesCallLogEntity.prototype, "instanceId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_hermes_call_logs_user_id'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], HermesCallLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'call_type',
        type: 'enum',
        enum: ['skill_execute', 'tool_call', 'agent_invoke', 'workflow_run'],
    }),
    __metadata("design:type", String)
], HermesCallLogEntity.prototype, "callType", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['success', 'failed', 'timeout', 'running'],
        default: 'running',
    }),
    __metadata("design:type", String)
], HermesCallLogEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'duration_ms', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], HermesCallLogEntity.prototype, "durationMs", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'credits_cost', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], HermesCallLogEntity.prototype, "creditsCost", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128, nullable: true }),
    __metadata("design:type", String)
], HermesCallLogEntity.prototype, "target", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_message', length: 512, nullable: true }),
    __metadata("design:type", String)
], HermesCallLogEntity.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_hermes_call_logs_created_at'),
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], HermesCallLogEntity.prototype, "createdAt", void 0);
exports.HermesCallLogEntity = HermesCallLogEntity = __decorate([
    (0, typeorm_1.Entity)('hermes_call_logs')
], HermesCallLogEntity);
//# sourceMappingURL=hermes-call-log.entity.js.map