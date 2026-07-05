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
exports.ChatSessionEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let ChatSessionEntity = class ChatSessionEntity extends base_entity_1.BaseEntity {
    title;
    modelId;
    agentId;
    groupId;
    attachedKnowledgeBaseIds;
    enabledPluginIds;
    enabledWorkflowIds;
    userId;
};
exports.ChatSessionEntity = ChatSessionEntity;
__decorate([
    (0, typeorm_1.Column)({ length: 128, default: '新会话' }),
    __metadata("design:type", String)
], ChatSessionEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'model_id', length: 64 }),
    __metadata("design:type", String)
], ChatSessionEntity.prototype, "modelId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'agent_id', length: 64, nullable: true }),
    __metadata("design:type", String)
], ChatSessionEntity.prototype, "agentId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'group_id', type: 'bigint', default: 0 }),
    __metadata("design:type", Number)
], ChatSessionEntity.prototype, "groupId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'attached_knowledge_base_ids', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], ChatSessionEntity.prototype, "attachedKnowledgeBaseIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'enabled_plugin_ids', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], ChatSessionEntity.prototype, "enabledPluginIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'enabled_workflow_ids', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], ChatSessionEntity.prototype, "enabledWorkflowIds", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], ChatSessionEntity.prototype, "userId", void 0);
exports.ChatSessionEntity = ChatSessionEntity = __decorate([
    (0, typeorm_1.Entity)('chat_sessions')
], ChatSessionEntity);
//# sourceMappingURL=chat-session.entity.js.map