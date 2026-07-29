"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RagService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const redis_service_1 = require("../../../common/services/redis.service");
const knowledge_base_entity_1 = require("../../knowledge/entities/knowledge-base.entity");
const knowledge_base_document_entity_1 = require("../../knowledge/entities/knowledge-base-document.entity");
const knowledge_base_chunk_entity_1 = require("../../knowledge/entities/knowledge-base-chunk.entity");
let RagService = RagService_1 = class RagService {
    kbRepo;
    docRepo;
    chunkRepo;
    redis;
    dataSource;
    logger = new common_1.Logger(RagService_1.name);
    constructor(kbRepo, docRepo, chunkRepo, redis, dataSource) {
        this.kbRepo = kbRepo;
        this.docRepo = docRepo;
        this.chunkRepo = chunkRepo;
        this.redis = redis;
        this.dataSource = dataSource;
    }
    health() {
        return { status: 'ok', module: 'rag' };
    }
    async retrieve(userId, query) {
        const { knowledgeBaseId, query: queryText, topK = 5 } = query;
        if (!queryText || !queryText.trim()) {
            throw new common_1.HttpException('查询文本不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        const kb = await this.kbRepo.findOne({
            where: { id: knowledgeBaseId, userId },
        });
        if (!kb) {
            throw new common_1.NotFoundException(`知识库 ${knowledgeBaseId} 不存在或无权访问`);
        }
        const cacheKey = this.buildCacheKey(userId, queryText, knowledgeBaseId);
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            return { ...parsed, cached: true };
        }
        const matches = await this.searchChunks(knowledgeBaseId, queryText, topK);
        const result = {
            query: queryText,
            matches,
            message: matches.length > 0 ? `找到 ${matches.length} 个相关文档片段` : '未找到相关文档片段',
            cached: false,
        };
        try {
            await this.redis.set(cacheKey, JSON.stringify(result), 60);
        }
        catch (err) {
            this.logger.warn(`缓存写入失败: ${err.message}`);
        }
        return result;
    }
    async augmentPrompt(userId, data) {
        const { query, retrievedDocs } = data;
        if (!query || !query.trim()) {
            throw new common_1.HttpException('查询文本不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        if (!retrievedDocs || retrievedDocs.length === 0) {
            return {
                augmentedPrompt: query,
                contextCount: 0,
            };
        }
        const contextBlocks = retrievedDocs.map((doc, index) => {
            const title = doc.documentName || `文档${doc.documentId}`;
            return `[文档${index + 1}] 标题: ${title}\n内容: ${doc.content}`;
        });
        const augmentedPrompt = [
            '基于以下知识库内容回答用户问题：',
            '',
            ...contextBlocks,
            '',
            `用户问题: ${query}`,
        ].join('\n');
        return {
            augmentedPrompt,
            contextCount: retrievedDocs.length,
        };
    }
    async indexDocument(userId, data) {
        const { knowledgeBaseId, documentId, content, chunkSize = 500, overlap = 50, } = data;
        if (!content || !content.trim()) {
            throw new common_1.HttpException('文档内容不能为空', common_1.HttpStatus.BAD_REQUEST);
        }
        const kb = await this.kbRepo.findOne({
            where: { id: knowledgeBaseId, userId },
        });
        if (!kb) {
            throw new common_1.NotFoundException(`知识库 ${knowledgeBaseId} 不存在或无权访问`);
        }
        const doc = await this.docRepo.findOne({
            where: { id: documentId, knowledgeBaseId },
        });
        if (!doc) {
            throw new common_1.NotFoundException(`文档 ${documentId} 不存在于知识库 ${knowledgeBaseId}`);
        }
        const chunks = this.splitTextIntoChunks(content, chunkSize, overlap);
        const result = await this.dataSource.transaction(async (manager) => {
            await manager.delete(knowledge_base_chunk_entity_1.KnowledgeBaseChunkEntity, { documentId });
            await manager.update(knowledge_base_document_entity_1.KnowledgeBaseDocumentEntity, { id: documentId }, { status: 'processing' });
            const chunkEntities = chunks.map((chunk, index) => {
                const entity = new knowledge_base_chunk_entity_1.KnowledgeBaseChunkEntity();
                entity.documentId = documentId;
                entity.knowledgeBaseId = knowledgeBaseId;
                entity.content = chunk.text;
                entity.chunkIndex = index;
                entity.tokenCount = chunk.tokenCount;
                entity.embeddingId = `tfidf_${documentId}_${index}`;
                return entity;
            });
            const savedChunks = await manager.save(knowledge_base_chunk_entity_1.KnowledgeBaseChunkEntity, chunkEntities);
            const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
            await manager.update(knowledge_base_document_entity_1.KnowledgeBaseDocumentEntity, { id: documentId }, {
                status: 'done',
                chunkCount: savedChunks.length,
                tokenCount: totalTokens,
            });
            return {
                chunkCount: savedChunks.length,
                totalTokens,
            };
        });
        await this.updateKnowledgeBaseStats(knowledgeBaseId);
        await this.clearRetrieveCache(userId, knowledgeBaseId);
        this.logger.log(`文档 ${documentId} 索引完成: ${result.chunkCount} 个分片, ${result.totalTokens} tokens`);
        return {
            documentId,
            knowledgeBaseId,
            chunkCount: result.chunkCount,
            totalTokens: result.totalTokens,
        };
    }
    async reindexKnowledgeBase(userId, knowledgeBaseId) {
        const kb = await this.kbRepo.findOne({
            where: { id: knowledgeBaseId, userId },
        });
        if (!kb) {
            throw new common_1.NotFoundException(`知识库 ${knowledgeBaseId} 不存在或无权访问`);
        }
        await this.kbRepo.update({ id: knowledgeBaseId }, { status: 'reindexing' });
        try {
            const documents = await this.docRepo.find({
                where: { knowledgeBaseId },
            });
            if (documents.length === 0) {
                await this.kbRepo.update({ id: knowledgeBaseId }, { status: 'active', documentCount: 0, totalChunks: 0, totalTokens: 0 });
                return {
                    knowledgeBaseId,
                    documentCount: 0,
                    totalChunks: 0,
                    totalTokens: 0,
                };
            }
            let totalChunks = 0;
            let totalTokens = 0;
            for (const doc of documents) {
                const content = await this.readDocumentContent(doc);
                if (!content || !content.trim()) {
                    this.logger.warn(`文档 ${doc.id} 内容为空，跳过`);
                    continue;
                }
                const chunks = this.splitTextIntoChunks(content, kb.chunkSize || 500, kb.chunkOverlap || 50);
                await this.dataSource.transaction(async (manager) => {
                    await manager.delete(knowledge_base_chunk_entity_1.KnowledgeBaseChunkEntity, { documentId: doc.id });
                    const chunkEntities = chunks.map((chunk, index) => {
                        const entity = new knowledge_base_chunk_entity_1.KnowledgeBaseChunkEntity();
                        entity.documentId = doc.id;
                        entity.knowledgeBaseId = knowledgeBaseId;
                        entity.content = chunk.text;
                        entity.chunkIndex = index;
                        entity.tokenCount = chunk.tokenCount;
                        entity.embeddingId = `tfidf_${doc.id}_${index}`;
                        return entity;
                    });
                    const saved = await manager.save(knowledge_base_chunk_entity_1.KnowledgeBaseChunkEntity, chunkEntities);
                    const docTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
                    await manager.update(knowledge_base_document_entity_1.KnowledgeBaseDocumentEntity, { id: doc.id }, {
                        status: 'done',
                        chunkCount: saved.length,
                        tokenCount: docTokens,
                    });
                    totalChunks += saved.length;
                    totalTokens += docTokens;
                });
            }
            await this.kbRepo.update({ id: knowledgeBaseId }, {
                status: 'active',
                documentCount: documents.length,
                totalChunks,
                totalTokens,
            });
            await this.clearRetrieveCache(userId, knowledgeBaseId);
            this.logger.log(`知识库 ${knowledgeBaseId} 重新索引完成: ${documents.length} 文档, ${totalChunks} 分片`);
            return {
                knowledgeBaseId,
                documentCount: documents.length,
                totalChunks,
                totalTokens,
            };
        }
        catch (err) {
            await this.kbRepo.update({ id: knowledgeBaseId }, { status: 'error' });
            this.logger.error(`知识库 ${knowledgeBaseId} 重新索引失败: ${err.message}`);
            throw new common_1.HttpException(`重新索引失败: ${err.message}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async searchChunks(knowledgeBaseId, queryText, topK) {
        const keywords = this.extractKeywords(queryText);
        if (keywords.length === 0) {
            return [];
        }
        try {
            const fulltextResults = await this.fulltextSearch(knowledgeBaseId, queryText, topK);
            if (fulltextResults.length > 0) {
                return fulltextResults;
            }
        }
        catch (err) {
            this.logger.warn(`FULLTEXT 搜索失败，回退到 LIKE 匹配: ${err.message}`);
        }
        return this.likeSearch(knowledgeBaseId, keywords, topK);
    }
    async fulltextSearch(knowledgeBaseId, queryText, topK) {
        const escapedQuery = queryText.replace(/['"\\]/g, ' ').trim();
        const rawResults = await this.chunkRepo
            .createQueryBuilder('chunk')
            .leftJoinAndSelect(knowledge_base_document_entity_1.KnowledgeBaseDocumentEntity, 'doc', 'doc.id = chunk.documentId')
            .select([
            'chunk.id AS chunkId',
            'chunk.document_id AS documentId',
            'doc.name AS documentName',
            'chunk.content AS content',
            'chunk.chunk_index AS chunkIndex',
        ])
            .addSelect(`MATCH(chunk.content) AGAINST (:queryText IN NATURAL LANGUAGE MODE)`, 'score')
            .where('chunk.knowledge_base_id = :kbId', { kbId: knowledgeBaseId })
            .andWhere(`MATCH(chunk.content) AGAINST (:queryText IN NATURAL LANGUAGE MODE)`)
            .setParameters({ queryText: escapedQuery })
            .orderBy('score', 'DESC')
            .limit(topK)
            .getRawMany();
        return rawResults.map((row) => ({
            chunkId: Number(row.chunkId),
            documentId: Number(row.documentId),
            documentName: row.documentName || '',
            content: row.content,
            chunkIndex: row.chunkIndex,
            score: Number(row.score) || 0,
        }));
    }
    async likeSearch(knowledgeBaseId, keywords, topK) {
        const qb = this.chunkRepo
            .createQueryBuilder('chunk')
            .leftJoinAndSelect(knowledge_base_document_entity_1.KnowledgeBaseDocumentEntity, 'doc', 'doc.id = chunk.documentId')
            .select([
            'chunk.id AS chunkId',
            'chunk.document_id AS documentId',
            'doc.name AS documentName',
            'chunk.content AS content',
            'chunk.chunk_index AS chunkIndex',
        ])
            .where('chunk.knowledge_base_id = :kbId', { kbId: knowledgeBaseId })
            .andWhere((qb) => {
            const conditions = [];
            keywords.forEach((kw, i) => {
                conditions.push(`chunk.content LIKE :kw${i}`);
                qb.setParameter(`kw${i}`, `%${kw}%`);
            });
            return conditions.join(' OR ');
        })
            .limit(topK * 3);
        const rawResults = await qb.getRawMany();
        const scored = rawResults.map((row) => {
            const contentLower = row.content.toLowerCase();
            let score = 0;
            for (const kw of keywords) {
                const kwLower = kw.toLowerCase();
                let idx = contentLower.indexOf(kwLower);
                while (idx !== -1) {
                    score += 1;
                    idx = contentLower.indexOf(kwLower, idx + kwLower.length);
                }
            }
            return {
                chunkId: Number(row.chunkId),
                documentId: Number(row.documentId),
                documentName: row.documentName || '',
                content: row.content,
                chunkIndex: row.chunkIndex,
                score,
            };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }
    extractKeywords(query) {
        const tokens = query
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((t) => t.length >= 2);
        const stopWords = new Set([
            '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
            '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
            '看', '好', '自己', '这', '那', '它', '他', '她', '们', '什么', '怎么',
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'and', 'or',
            'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how', 'what',
            'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'in', 'on',
            'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'it', 'its',
        ]);
        return tokens.filter((t) => !stopWords.has(t.toLowerCase()));
    }
    splitTextIntoChunks(text, chunkSize, overlap) {
        const chunks = [];
        if (!text || text.length === 0) {
            return chunks;
        }
        const effectiveOverlap = Math.min(overlap, chunkSize - 1);
        const step = chunkSize - effectiveOverlap;
        let start = 0;
        while (start < text.length) {
            const end = Math.min(start + chunkSize, text.length);
            const chunkText = text.slice(start, end).trim();
            if (chunkText.length > 0) {
                const tokenCount = this.estimateTokenCount(chunkText);
                chunks.push({ text: chunkText, tokenCount });
            }
            if (end >= text.length) {
                break;
            }
            start += step;
        }
        return chunks;
    }
    estimateTokenCount(text) {
        let count = 0;
        for (const char of text) {
            if (/[\u4e00-\u9fa5]/.test(char)) {
                count += 1.5;
            }
            else {
                count += 0.25;
            }
        }
        return Math.ceil(count);
    }
    async updateKnowledgeBaseStats(knowledgeBaseId) {
        const stats = await this.chunkRepo
            .createQueryBuilder('chunk')
            .select('COUNT(*)', 'totalChunks')
            .addSelect('COALESCE(SUM(chunk.token_count), 0)', 'totalTokens')
            .where('chunk.knowledge_base_id = :kbId', { kbId: knowledgeBaseId })
            .getRawOne();
        const docCount = await this.docRepo.count({
            where: { knowledgeBaseId },
        });
        await this.kbRepo.update({ id: knowledgeBaseId }, {
            documentCount: docCount,
            totalChunks: Number(stats?.totalChunks || 0),
            totalTokens: Number(stats?.totalTokens || 0),
            status: 'active',
        });
    }
    async readDocumentContent(doc) {
        try {
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            const path = await Promise.resolve().then(() => __importStar(require('path')));
            const filePath = path.resolve(doc.filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            return content;
        }
        catch (err) {
            this.logger.warn(`读取文档 ${doc.id} 内容失败: ${err.message}`);
            return '';
        }
    }
    buildCacheKey(userId, query, knowledgeBaseId) {
        const queryHash = (0, crypto_1.createHash)('md5').update(query).digest('hex');
        return `rag:retrieve:${userId}:${queryHash}:${knowledgeBaseId}`;
    }
    async clearRetrieveCache(userId, knowledgeBaseId) {
        try {
            const client = this.redis.getClient();
            const pattern = `rag:retrieve:${userId}:*:${knowledgeBaseId}`;
            let cursor = '0';
            do {
                const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = nextCursor;
                if (keys.length > 0) {
                    await client.del(...keys);
                }
            } while (cursor !== '0');
        }
        catch (err) {
            this.logger.warn(`清除检索缓存失败: ${err.message}`);
        }
    }
};
exports.RagService = RagService;
exports.RagService = RagService = RagService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(knowledge_base_entity_1.KnowledgeBaseEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(knowledge_base_document_entity_1.KnowledgeBaseDocumentEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(knowledge_base_chunk_entity_1.KnowledgeBaseChunkEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        redis_service_1.RedisService,
        typeorm_2.DataSource])
], RagService);
//# sourceMappingURL=rag.service.js.map