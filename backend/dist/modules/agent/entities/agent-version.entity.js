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
exports.AgentVersionEntity = void 0;
const typeorm_1 = require("typeorm");
let AgentVersionEntity = class AgentVersionEntity {
    id;
    agentId;
    version;
    systemPrompt;
    modelId;
    config;
    changelog;
    createdAt;
};
exports.AgentVersionEntity = AgentVersionEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], AgentVersionEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_agent_versions_agent_id'),
    (0, typeorm_1.Column)({ name: 'agent_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentVersionEntity.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], AgentVersionEntity.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'system_prompt', type: 'text' }),
    __metadata("design:type", String)
], AgentVersionEntity.prototype, "systemPrompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'model_id', length: 64 }),
    __metadata("design:type", String)
], AgentVersionEntity.prototype, "modelId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], AgentVersionEntity.prototype, "config", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], AgentVersionEntity.prototype, "changelog", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], AgentVersionEntity.prototype, "createdAt", void 0);
exports.AgentVersionEntity = AgentVersionEntity = __decorate([
    (0, typeorm_1.Entity)('agent_versions')
], AgentVersionEntity);
//# sourceMappingURL=agent-version.entity.js.map