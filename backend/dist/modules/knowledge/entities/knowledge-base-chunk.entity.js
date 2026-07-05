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
exports.KnowledgeBaseChunkEntity = void 0;
const typeorm_1 = require("typeorm");
let KnowledgeBaseChunkEntity = class KnowledgeBaseChunkEntity {
    id;
    documentId;
    knowledgeBaseId;
    content;
    chunkIndex;
    tokenCount;
    embeddingId;
    createdAt;
};
exports.KnowledgeBaseChunkEntity = KnowledgeBaseChunkEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], KnowledgeBaseChunkEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_knowledge_base_chunks_document_id'),
    (0, typeorm_1.Column)({ name: 'document_id', type: 'bigint' }),
    __metadata("design:type", Number)
], KnowledgeBaseChunkEntity.prototype, "documentId", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_knowledge_base_chunks_kb_id'),
    (0, typeorm_1.Column)({ name: 'knowledge_base_id', type: 'bigint' }),
    __metadata("design:type", Number)
], KnowledgeBaseChunkEntity.prototype, "knowledgeBaseId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], KnowledgeBaseChunkEntity.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chunk_index', type: 'int' }),
    __metadata("design:type", Number)
], KnowledgeBaseChunkEntity.prototype, "chunkIndex", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'token_count', type: 'int' }),
    __metadata("design:type", Number)
], KnowledgeBaseChunkEntity.prototype, "tokenCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'embedding_id', length: 64 }),
    __metadata("design:type", String)
], KnowledgeBaseChunkEntity.prototype, "embeddingId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], KnowledgeBaseChunkEntity.prototype, "createdAt", void 0);
exports.KnowledgeBaseChunkEntity = KnowledgeBaseChunkEntity = __decorate([
    (0, typeorm_1.Entity)('knowledge_base_chunks')
], KnowledgeBaseChunkEntity);
//# sourceMappingURL=knowledge-base-chunk.entity.js.map