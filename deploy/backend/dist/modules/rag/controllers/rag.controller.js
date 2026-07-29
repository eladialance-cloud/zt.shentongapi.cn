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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const rag_service_1 = require("../services/rag.service");
let RagController = class RagController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    retrieve(user, body) {
        return this.service.retrieve(user.userId, body);
    }
    augment(user, body) {
        return this.service.augmentPrompt(user.userId, body);
    }
    index(user, body) {
        return this.service.indexDocument(user.userId, body);
    }
    reindex(user, knowledgeBaseId) {
        return this.service.reindexKnowledgeBase(user.userId, Number(knowledgeBaseId));
    }
};
exports.RagController = RagController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RagController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('retrieve'),
    (0, swagger_1.ApiOperation)({ summary: '检索知识库' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RagController.prototype, "retrieve", null);
__decorate([
    (0, common_1.Post)('augment'),
    (0, swagger_1.ApiOperation)({ summary: '增强提示词' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RagController.prototype, "augment", null);
__decorate([
    (0, common_1.Post)('index'),
    (0, swagger_1.ApiOperation)({ summary: '索引文档' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RagController.prototype, "index", null);
__decorate([
    (0, common_1.Post)('reindex/:knowledgeBaseId'),
    (0, swagger_1.ApiOperation)({ summary: '重新索引知识库' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('knowledgeBaseId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], RagController.prototype, "reindex", null);
exports.RagController = RagController = __decorate([
    (0, swagger_1.ApiTags)('RAG'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('rag'),
    __metadata("design:paramtypes", [rag_service_1.RagService])
], RagController);
//# sourceMappingURL=rag.controller.js.map