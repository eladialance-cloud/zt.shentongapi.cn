"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const rag_controller_1 = require("./controllers/rag.controller");
const rag_service_1 = require("./services/rag.service");
const knowledge_base_entity_1 = require("../knowledge/entities/knowledge-base.entity");
const knowledge_base_document_entity_1 = require("../knowledge/entities/knowledge-base-document.entity");
const knowledge_base_chunk_entity_1 = require("../knowledge/entities/knowledge-base-chunk.entity");
let RagModule = class RagModule {
};
exports.RagModule = RagModule;
exports.RagModule = RagModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                knowledge_base_entity_1.KnowledgeBaseEntity,
                knowledge_base_document_entity_1.KnowledgeBaseDocumentEntity,
                knowledge_base_chunk_entity_1.KnowledgeBaseChunkEntity,
            ]),
        ],
        controllers: [rag_controller_1.RagController],
        providers: [rag_service_1.RagService],
        exports: [rag_service_1.RagService],
    })
], RagModule);
//# sourceMappingURL=rag.module.js.map