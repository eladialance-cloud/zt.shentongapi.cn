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
exports.AuditQueueEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let AuditQueueEntity = class AuditQueueEntity extends base_entity_1.BaseEntity {
    type;
    contentSummary;
    content;
    userId;
    username;
    triggerReason;
    hitWords;
    riskLevel;
    status;
    processedBy;
    processedAt;
    processRemark;
};
exports.AuditQueueEntity = AuditQueueEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['conversation', 'agent', 'plugin', 'workflow'],
    }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'content_summary', length: 512 }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "contentSummary", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AuditQueueEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: true }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'trigger_reason',
        type: 'enum',
        enum: ['sensitive_word', 'ai_audit'],
        default: 'sensitive_word',
    }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "triggerReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hit_words', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], AuditQueueEntity.prototype, "hitWords", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'risk_level',
        type: 'enum',
        enum: ['low', 'medium', 'high'],
        default: 'low',
    }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "riskLevel", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['pending', 'approved', 'rejected', 'false_positive'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'processed_by', length: 64, nullable: true }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "processedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'processed_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], AuditQueueEntity.prototype, "processedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'process_remark', length: 512, nullable: true }),
    __metadata("design:type", String)
], AuditQueueEntity.prototype, "processRemark", void 0);
exports.AuditQueueEntity = AuditQueueEntity = __decorate([
    (0, typeorm_1.Entity)('audit_queue')
], AuditQueueEntity);
//# sourceMappingURL=audit-queue.entity.js.map