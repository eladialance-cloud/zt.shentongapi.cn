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
exports.KnowledgeBaseDocumentEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let KnowledgeBaseDocumentEntity = class KnowledgeBaseDocumentEntity extends base_entity_1.BaseEntity {
    knowledgeBaseId;
    name;
    filePath;
    fileSize;
    mimeType;
    chunkCount;
    tokenCount;
    status;
    error;
};
exports.KnowledgeBaseDocumentEntity = KnowledgeBaseDocumentEntity;
__decorate([
    (0, typeorm_1.Index)('idx_knowledge_base_documents_kb_id'),
    (0, typeorm_1.Column)({ name: 'knowledge_base_id', type: 'bigint' }),
    __metadata("design:type", Number)
], KnowledgeBaseDocumentEntity.prototype, "knowledgeBaseId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 256 }),
    __metadata("design:type", String)
], KnowledgeBaseDocumentEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'file_path', length: 512 }),
    __metadata("design:type", String)
], KnowledgeBaseDocumentEntity.prototype, "filePath", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'file_size', type: 'int' }),
    __metadata("design:type", Number)
], KnowledgeBaseDocumentEntity.prototype, "fileSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mime_type', length: 128, nullable: true }),
    __metadata("design:type", String)
], KnowledgeBaseDocumentEntity.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'chunk_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], KnowledgeBaseDocumentEntity.prototype, "chunkCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'token_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], KnowledgeBaseDocumentEntity.prototype, "tokenCount", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['pending', 'processing', 'done', 'error'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], KnowledgeBaseDocumentEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], KnowledgeBaseDocumentEntity.prototype, "error", void 0);
exports.KnowledgeBaseDocumentEntity = KnowledgeBaseDocumentEntity = __decorate([
    (0, typeorm_1.Entity)('knowledge_base_documents')
], KnowledgeBaseDocumentEntity);
//# sourceMappingURL=knowledge-base-document.entity.js.map