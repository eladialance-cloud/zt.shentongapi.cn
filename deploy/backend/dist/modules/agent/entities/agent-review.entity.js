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
exports.AgentReviewEntity = void 0;
const typeorm_1 = require("typeorm");
let AgentReviewEntity = class AgentReviewEntity {
    id;
    agentId;
    reviewerId;
    action;
    reason;
    createdAt;
};
exports.AgentReviewEntity = AgentReviewEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], AgentReviewEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_reviews_agent_id'),
    (0, typeorm_1.Column)({ name: 'agent_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentReviewEntity.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_reviews_reviewer_id'),
    (0, typeorm_1.Column)({ name: 'reviewer_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentReviewEntity.prototype, "reviewerId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['approve', 'reject'],
    }),
    __metadata("design:type", String)
], AgentReviewEntity.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentReviewEntity.prototype, "reason", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], AgentReviewEntity.prototype, "createdAt", void 0);
exports.AgentReviewEntity = AgentReviewEntity = __decorate([
    (0, typeorm_1.Entity)('agent_reviews')
], AgentReviewEntity);
//# sourceMappingURL=agent-review.entity.js.map