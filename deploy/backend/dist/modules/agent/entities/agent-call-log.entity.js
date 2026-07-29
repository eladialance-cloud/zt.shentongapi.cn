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
exports.AgentCallLogEntity = void 0;
const typeorm_1 = require("typeorm");
let AgentCallLogEntity = class AgentCallLogEntity {
    id;
    agentId;
    userId;
    sessionId;
    tokenUsage;
    creditsCost;
    durationMs;
    success;
    error;
    createdAt;
};
exports.AgentCallLogEntity = AgentCallLogEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], AgentCallLogEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_call_logs_agent_id'),
    (0, typeorm_1.Column)({ name: 'agent_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentCallLogEntity.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_call_logs_user_id'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentCallLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_call_logs_session_id'),
    (0, typeorm_1.Column)({ name: 'session_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentCallLogEntity.prototype, "sessionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'token_usage', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], AgentCallLogEntity.prototype, "tokenUsage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'credits_cost', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], AgentCallLogEntity.prototype, "creditsCost", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'duration_ms', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], AgentCallLogEntity.prototype, "durationMs", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean' }),
    __metadata("design:type", Boolean)
], AgentCallLogEntity.prototype, "success", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentCallLogEntity.prototype, "error", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_call_logs_created_at'),
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], AgentCallLogEntity.prototype, "createdAt", void 0);
exports.AgentCallLogEntity = AgentCallLogEntity = __decorate([
    (0, typeorm_1.Entity)('agent_call_logs')
], AgentCallLogEntity);
//# sourceMappingURL=agent-call-log.entity.js.map