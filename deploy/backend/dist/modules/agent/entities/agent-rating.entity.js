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
exports.AgentRatingEntity = void 0;
const typeorm_1 = require("typeorm");
let AgentRatingEntity = class AgentRatingEntity {
    id;
    agentId;
    userId;
    rating;
    review;
    createdAt;
};
exports.AgentRatingEntity = AgentRatingEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], AgentRatingEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_ratings_agent_id'),
    (0, typeorm_1.Column)({ name: 'agent_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentRatingEntity.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_ratings_user_id'),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentRatingEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int' }),
    __metadata("design:type", Number)
], AgentRatingEntity.prototype, "rating", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], AgentRatingEntity.prototype, "review", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], AgentRatingEntity.prototype, "createdAt", void 0);
exports.AgentRatingEntity = AgentRatingEntity = __decorate([
    (0, typeorm_1.Entity)('agent_ratings'),
    (0, typeorm_1.Index)('uniq_agent_ratings_user_agent', ['userId', 'agentId'], { unique: true })
], AgentRatingEntity);
//# sourceMappingURL=agent-rating.entity.js.map