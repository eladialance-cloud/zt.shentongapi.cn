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
exports.AgentEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let AgentEntity = class AgentEntity extends base_entity_1.BaseEntity {
    name;
    description;
    avatar;
    systemPrompt;
    usageExample;
    modelId;
    pricePerCall;
    pricePerToken;
    creatorId;
    creatorType;
    status;
    category;
    tags;
    allowedPluginIds;
    allowedWorkflowIds;
    allowedKnowledgeBaseIds;
    rating;
    ratingCount;
    callCount;
    revenue;
    rejectionReason;
    publishedAt;
    openclawAgentId;
    sourceType;
    sourceName;
    sourceRepoUrl;
    sourceFilePath;
    sourceCategory;
    sourceVersion;
    runtimeType;
    isOfficial;
    officialVisible;
    syncStatus;
    syncError;
    userId;
};
exports.AgentEntity = AgentEntity;
__decorate([
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], AgentEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "avatar", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'system_prompt', type: 'text' }),
    __metadata("design:type", String)
], AgentEntity.prototype, "systemPrompt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'usage_example', type: 'text', nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "usageExample", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'model_id', length: 64 }),
    __metadata("design:type", String)
], AgentEntity.prototype, "modelId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'price_per_call', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], AgentEntity.prototype, "pricePerCall", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'price_per_token', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], AgentEntity.prototype, "pricePerToken", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'creator_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentEntity.prototype, "creatorId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'creator_type',
        type: 'enum',
        enum: ['official', 'user'],
        default: 'user',
    }),
    __metadata("design:type", String)
], AgentEntity.prototype, "creatorType", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['draft', 'pending_review', 'published', 'rejected', 'offline'],
        default: 'draft',
    }),
    __metadata("design:type", String)
], AgentEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['office', 'programming', 'copywriting', 'data_analysis', 'other'],
        default: 'other',
    }),
    __metadata("design:type", String)
], AgentEntity.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Array)
], AgentEntity.prototype, "tags", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'allowed_plugin_ids', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], AgentEntity.prototype, "allowedPluginIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'allowed_workflow_ids', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], AgentEntity.prototype, "allowedWorkflowIds", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'allowed_knowledge_base_ids', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], AgentEntity.prototype, "allowedKnowledgeBaseIds", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'decimal', precision: 3, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], AgentEntity.prototype, "rating", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rating_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], AgentEntity.prototype, "ratingCount", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'call_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], AgentEntity.prototype, "callCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], AgentEntity.prototype, "revenue", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rejection_reason', length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "rejectionReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'published_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], AgentEntity.prototype, "publishedAt", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'openclaw_agent_id', length: 64, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "openclawAgentId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'source_type',
        type: 'enum',
        enum: ['official', 'user', 'imported'],
        default: 'user',
    }),
    __metadata("design:type", String)
], AgentEntity.prototype, "sourceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_name', length: 128, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "sourceName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_repo_url', length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "sourceRepoUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_file_path', length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "sourceFilePath", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_category', length: 64, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "sourceCategory", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_version', length: 32, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "sourceVersion", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'runtime_type',
        type: 'enum',
        enum: ['openclaw', 'hermes', 'hybrid'],
        default: 'openclaw',
    }),
    __metadata("design:type", String)
], AgentEntity.prototype, "runtimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_official', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], AgentEntity.prototype, "isOfficial", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'official_visible', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], AgentEntity.prototype, "officialVisible", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'sync_status',
        type: 'enum',
        enum: ['pending', 'synced', 'failed'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], AgentEntity.prototype, "syncStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sync_error', length: 512, nullable: true }),
    __metadata("design:type", String)
], AgentEntity.prototype, "syncError", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], AgentEntity.prototype, "userId", void 0);
exports.AgentEntity = AgentEntity = __decorate([
    (0, typeorm_1.Entity)('agents')
], AgentEntity);
//# sourceMappingURL=agent.entity.js.map