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
exports.KnowledgeBaseEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let KnowledgeBaseEntity = class KnowledgeBaseEntity extends base_entity_1.BaseEntity {
    userId;
    name;
    description;
    visibility;
    status;
    embeddingModel;
    chunkSize;
    chunkOverlap;
    documentCount;
    totalChunks;
    totalTokens;
};
exports.KnowledgeBaseEntity = KnowledgeBaseEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint' }),
    __metadata("design:type", Number)
], KnowledgeBaseEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], KnowledgeBaseEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], KnowledgeBaseEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['private', 'public'],
        default: 'private',
    }),
    __metadata("design:type", String)
], KnowledgeBaseEntity.prototype, "visibility", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: [
            'active',
            'processing',
            'reindexing',
            'error',
            'deleting',
            'delete_failed',
        ],
        default: 'active',
    }),
    __metadata("design:type", String)
], KnowledgeBaseEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'embedding_model', length: 64, default: 'text-embedding-ada-002' }),
    __metadata("design:type", String)
], KnowledgeBaseEntity.prototype, "embeddingModel", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chunk_size', type: 'int', default: 1000 }),
    __metadata("design:type", Number)
], KnowledgeBaseEntity.prototype, "chunkSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chunk_overlap', type: 'int', default: 200 }),
    __metadata("design:type", Number)
], KnowledgeBaseEntity.prototype, "chunkOverlap", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'document_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], KnowledgeBaseEntity.prototype, "documentCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_chunks', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], KnowledgeBaseEntity.prototype, "totalChunks", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_tokens', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], KnowledgeBaseEntity.prototype, "totalTokens", void 0);
exports.KnowledgeBaseEntity = KnowledgeBaseEntity = __decorate([
    (0, typeorm_1.Entity)('knowledge_bases')
], KnowledgeBaseEntity);
//# sourceMappingURL=knowledge-base.entity.js.map