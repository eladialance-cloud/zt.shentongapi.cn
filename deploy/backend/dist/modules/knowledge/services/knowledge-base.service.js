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
exports.KnowledgeBaseService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const knowledge_base_entity_1 = require("../entities/knowledge-base.entity");
const knowledge_base_document_entity_1 = require("../entities/knowledge-base-document.entity");
let KnowledgeBaseService = class KnowledgeBaseService {
    kbRepo;
    docRepo;
    constructor(kbRepo, docRepo) {
        this.kbRepo = kbRepo;
        this.docRepo = docRepo;
    }
    health() {
        return { status: 'ok', module: 'knowledgeBase' };
    }
    async create(userId, data) {
        const kb = this.kbRepo.create({
            userId,
            name: data.name,
            description: data.description,
            visibility: data.visibility ?? 'private',
            status: 'active',
        });
        return this.kbRepo.save(kb);
    }
    async list(userId, page = 1, pageSize = 20) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const [list, total] = await this.kbRepo.findAndCount({
            where: { userId },
            order: { updatedAt: 'DESC' },
            skip: (p - 1) * ps,
            take: ps,
        });
        return {
            list,
            total,
            page: p,
            pageSize: ps,
            totalPages: Math.ceil(total / ps) || 0,
        };
    }
    async detail(id, userId) {
        const kb = await this.kbRepo.findOne({ where: { id, userId } });
        if (!kb) {
            throw new common_1.NotFoundException(`知识库 ${id} 不存在`);
        }
        return kb;
    }
    async update(id, userId, data) {
        const kb = await this.detail(id, userId);
        Object.assign(kb, data);
        return this.kbRepo.save(kb);
    }
    async remove(id, userId) {
        const kb = await this.detail(id, userId);
        await this.kbRepo.remove(kb);
    }
    async uploadDocument(kbId, userId, file) {
        await this.detail(kbId, userId);
        const doc = this.docRepo.create({
            knowledgeBaseId: kbId,
            name: file.originalname,
            filePath: file.path,
            fileSize: file.size,
            mimeType: file.mimetype,
            status: 'pending',
        });
        return this.docRepo.save(doc);
    }
    async listDocuments(kbId, userId, page = 1, pageSize = 20) {
        await this.detail(kbId, userId);
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const [list, total] = await this.docRepo.findAndCount({
            where: { knowledgeBaseId: kbId },
            order: { createdAt: 'DESC' },
            skip: (p - 1) * ps,
            take: ps,
        });
        return {
            list,
            total,
            page: p,
            pageSize: ps,
            totalPages: Math.ceil(total / ps) || 0,
        };
    }
    async deleteDocument(kbId, docId, userId) {
        await this.detail(kbId, userId);
        const doc = await this.docRepo.findOne({
            where: { id: docId, knowledgeBaseId: kbId },
        });
        if (!doc) {
            throw new common_1.NotFoundException(`文档 ${docId} 不存在`);
        }
        await this.docRepo.remove(doc);
    }
};
exports.KnowledgeBaseService = KnowledgeBaseService;
exports.KnowledgeBaseService = KnowledgeBaseService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(knowledge_base_entity_1.KnowledgeBaseEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(knowledge_base_document_entity_1.KnowledgeBaseDocumentEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], KnowledgeBaseService);
//# sourceMappingURL=knowledge-base.service.js.map