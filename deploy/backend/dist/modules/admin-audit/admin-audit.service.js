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
exports.AdminAuditService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const sensitive_word_entity_1 = require("./entities/sensitive-word.entity");
const ai_audit_config_entity_1 = require("./entities/ai-audit-config.entity");
const audit_queue_entity_1 = require("./entities/audit-queue.entity");
const AUDIT_CONFIG_ID = 1;
const DEFAULT_AUDIT_CONFIG = {
    enabled: false,
    modelId: '',
    sensitiveThreshold: 0.5,
    violenceThreshold: 0.5,
    pornThreshold: 0.5,
    autoProcess: false,
};
let AdminAuditService = class AdminAuditService {
    queueRepo;
    wordRepo;
    configRepo;
    constructor(queueRepo, wordRepo, configRepo) {
        this.queueRepo = queueRepo;
        this.wordRepo = wordRepo;
        this.configRepo = configRepo;
    }
    async listQueue(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.queueRepo.createQueryBuilder('q');
        if (query.type) {
            qb.andWhere('q.type = :type', { type: query.type });
        }
        if (query.status) {
            qb.andWhere('q.status = :status', { status: query.status });
        }
        qb.orderBy('q.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [rows, total] = await qb.getManyAndCount();
        return {
            list: rows.map((r) => this.toQueueItem(r)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async approve(id, adminUser) {
        const item = await this.queueRepo.findOne({ where: { id } });
        if (!item) {
            throw new common_1.NotFoundException(`审核记录 ${id} 不存在`);
        }
        item.status = 'approved';
        item.processedBy = adminUser.username;
        item.processedAt = new Date();
        await this.queueRepo.save(item);
    }
    async reject(id, dto, adminUser) {
        const item = await this.queueRepo.findOne({ where: { id } });
        if (!item) {
            throw new common_1.NotFoundException(`审核记录 ${id} 不存在`);
        }
        item.status = 'rejected';
        item.processedBy = adminUser.username;
        item.processedAt = new Date();
        item.processRemark = dto.reason;
        await this.queueRepo.save(item);
    }
    async markFalsePositive(id, adminUser) {
        const item = await this.queueRepo.findOne({ where: { id } });
        if (!item) {
            throw new common_1.NotFoundException(`审核记录 ${id} 不存在`);
        }
        item.status = 'false_positive';
        item.processedBy = adminUser.username;
        item.processedAt = new Date();
        await this.queueRepo.save(item);
    }
    async listSensitiveWords(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.wordRepo.createQueryBuilder('w');
        if (query.category) {
            qb.andWhere('w.category = :category', { category: query.category });
        }
        if (query.keyword) {
            qb.andWhere('w.word LIKE :kw', { kw: `%${query.keyword}%` });
        }
        qb.orderBy('w.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [rows, total] = await qb.getManyAndCount();
        return {
            list: rows.map((r) => this.toSensitiveWord(r)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async createSensitiveWord(dto) {
        const entity = this.wordRepo.create({
            word: dto.word,
            category: dto.category,
            level: dto.level,
            replacement: dto.replacement,
        });
        const saved = await this.wordRepo.save(entity);
        return this.toSensitiveWord(saved);
    }
    async batchCreateSensitiveWords(dto) {
        const entities = dto.words.map((w) => this.wordRepo.create({
            word: w.word,
            category: w.category,
            level: w.level,
        }));
        let created = 0;
        for (const entity of entities) {
            try {
                await this.wordRepo.insert(entity);
                created++;
            }
            catch {
            }
        }
        return { created };
    }
    async deleteSensitiveWord(id) {
        const item = await this.wordRepo.findOne({ where: { id } });
        if (!item) {
            throw new common_1.NotFoundException(`敏感词 ${id} 不存在`);
        }
        await this.wordRepo.remove(item);
    }
    async getAuditConfig() {
        const row = await this.configRepo.findOne({
            where: { id: AUDIT_CONFIG_ID },
        });
        if (!row) {
            return { ...DEFAULT_AUDIT_CONFIG };
        }
        return { ...DEFAULT_AUDIT_CONFIG, ...row.config, updatedAt: row.updatedAt };
    }
    async updateAuditConfig(dto) {
        const existing = await this.configRepo.findOne({
            where: { id: AUDIT_CONFIG_ID },
        });
        const merged = existing
            ? { ...existing.config }
            : { ...DEFAULT_AUDIT_CONFIG };
        if (dto.enabled !== undefined)
            merged.enabled = dto.enabled;
        if (dto.modelId !== undefined)
            merged.modelId = dto.modelId;
        if (dto.sensitiveThreshold !== undefined)
            merged.sensitiveThreshold = dto.sensitiveThreshold;
        if (dto.violenceThreshold !== undefined)
            merged.violenceThreshold = dto.violenceThreshold;
        if (dto.pornThreshold !== undefined)
            merged.pornThreshold = dto.pornThreshold;
        if (dto.autoProcess !== undefined)
            merged.autoProcess = dto.autoProcess;
        if (existing) {
            existing.config = merged;
            await this.configRepo.save(existing);
        }
        else {
            const created = this.configRepo.create({
                id: AUDIT_CONFIG_ID,
                config: merged,
            });
            await this.configRepo.save(created);
        }
    }
    async testAudit(dto) {
        const words = await this.wordRepo.find();
        const text = dto.text || '';
        const hitWords = [];
        for (const w of words) {
            if (w.word && text.includes(w.word)) {
                hitWords.push(w.word);
            }
        }
        const flagged = hitWords.length > 0;
        const riskScore = Math.min(1, hitWords.length * 0.3);
        const suggestion = flagged
            ? riskScore >= 0.7
                ? 'block'
                : 'review'
            : 'allow';
        return {
            flagged,
            riskScore,
            categories: {
                sensitive: flagged ? Math.min(1, riskScore) : 0,
                violence: 0,
                porn: 0,
            },
            hitWords,
            suggestion,
        };
    }
    toQueueItem(r) {
        return {
            id: r.id,
            type: r.type,
            contentSummary: r.contentSummary,
            content: r.content,
            userId: r.userId,
            username: r.username,
            triggerReason: r.triggerReason,
            hitWords: r.hitWords,
            riskLevel: r.riskLevel,
            status: r.status,
            createdAt: r.createdAt,
            processedBy: r.processedBy,
            processedAt: r.processedAt,
            processRemark: r.processRemark,
        };
    }
    toSensitiveWord(r) {
        return {
            id: r.id,
            word: r.word,
            category: r.category,
            level: r.level,
            replacement: r.replacement,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        };
    }
};
exports.AdminAuditService = AdminAuditService;
exports.AdminAuditService = AdminAuditService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(audit_queue_entity_1.AuditQueueEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(sensitive_word_entity_1.SensitiveWordEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(ai_audit_config_entity_1.AiAuditConfigEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], AdminAuditService);
//# sourceMappingURL=admin-audit.service.js.map