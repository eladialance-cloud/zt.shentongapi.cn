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
exports.OpcAgentRepoEntity = void 0;
const typeorm_1 = require("typeorm");
let OpcAgentRepoEntity = class OpcAgentRepoEntity {
    id;
    teamId;
    agentId;
    agentName;
    agentAvatar;
    description;
    version;
    addedBy;
    addedAt;
};
exports.OpcAgentRepoEntity = OpcAgentRepoEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], OpcAgentRepoEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_opc_agent_repos_team_id'),
    (0, typeorm_1.Column)({ name: 'team_id', type: 'bigint' }),
    __metadata("design:type", Number)
], OpcAgentRepoEntity.prototype, "teamId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_opc_agent_repos_agent_id'),
    (0, typeorm_1.Column)({ name: 'agent_id', type: 'bigint' }),
    __metadata("design:type", Number)
], OpcAgentRepoEntity.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'agent_name', length: 64 }),
    __metadata("design:type", String)
], OpcAgentRepoEntity.prototype, "agentName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'agent_avatar', length: 512, nullable: true }),
    __metadata("design:type", String)
], OpcAgentRepoEntity.prototype, "agentAvatar", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], OpcAgentRepoEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], OpcAgentRepoEntity.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'added_by', type: 'bigint' }),
    __metadata("design:type", Number)
], OpcAgentRepoEntity.prototype, "addedBy", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'added_at' }),
    __metadata("design:type", Date)
], OpcAgentRepoEntity.prototype, "addedAt", void 0);
exports.OpcAgentRepoEntity = OpcAgentRepoEntity = __decorate([
    (0, typeorm_1.Entity)('opc_agent_repos')
], OpcAgentRepoEntity);
//# sourceMappingURL=opc-agent-repo.entity.js.map