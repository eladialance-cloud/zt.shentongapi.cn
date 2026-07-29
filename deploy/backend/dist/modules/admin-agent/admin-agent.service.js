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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AdminAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAgentService = void 0;
const crypto = __importStar(require("crypto"));
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const agent_entity_1 = require("../agent/entities/agent.entity");
const agent_review_entity_1 = require("../agent/entities/agent-review.entity");
const user_entity_1 = require("../user/entities/user.entity");
const agent_category_entity_1 = require("./entities/agent-category.entity");
const agent_import_task_entity_1 = require("./entities/agent-import-task.entity");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
const agent_import_parser_1 = require("./agent-import.parser");
const agent_import_constants_1 = require("./agent-import.constants");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const FIXED_CATEGORIES = [
    'office',
    'programming',
    'copywriting',
    'data_analysis',
    'other',
];
const DEFAULT_DISPLAY_NAMES = {
    office: '办公',
    programming: '编程',
    copywriting: '文案',
    data_analysis: '数据分析',
    other: '其他',
};
const VALID_TRANSITIONS = {
    draft: ['pending_review', 'published'],
    pending_review: ['approved', 'rejected'],
    approved: ['published'],
    published: ['offline'],
    rejected: ['draft', 'pending_review'],
    offline: ['published', 'draft'],
};
let AdminAgentService = AdminAgentService_1 = class AdminAgentService {
    agentRepo;
    reviewRepo;
    categoryRepo;
    userRepo;
    agentImportTaskRepo;
    logger = new common_1.Logger(AdminAgentService_1.name);
    constructor(agentRepo, reviewRepo, categoryRepo, userRepo, agentImportTaskRepo) {
        this.agentRepo = agentRepo;
        this.reviewRepo = reviewRepo;
        this.categoryRepo = categoryRepo;
        this.userRepo = userRepo;
        this.agentImportTaskRepo = agentImportTaskRepo;
    }
    async listAgents(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.agentRepo.createQueryBuilder('a');
        if (query.status) {
            const entityStatus = this.toEntityStatus(query.status);
            if (entityStatus) {
                qb.andWhere('a.status = :status', { status: entityStatus });
            }
        }
        if (query.category) {
            qb.andWhere('a.category = :category', { category: query.category });
        }
        qb.orderBy('a.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [agents, total] = await qb.getManyAndCount();
        const list = await this.toAdminAgentItems(agents);
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async getAgentDetail(id) {
        const agent = await this.agentRepo.findOne({ where: { id } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'Agent 不存在');
        }
        const items = await this.toAdminAgentItems([agent]);
        return items[0];
    }
    async createAgent(dto, adminId) {
        const agent = this.agentRepo.create({
            name: dto.name,
            description: dto.description,
            systemPrompt: dto.systemPrompt || '',
            usageExample: dto.usageExamples?.join('\n') || undefined,
            modelId: dto.modelId || '',
            pricePerCall: dto.pricePerCall,
            pricePerToken: dto.pricingMode === 'perToken'
                ? { input: dto.pricePerTokenInput, output: dto.pricePerTokenOutput }
                : undefined,
            creatorId: adminId,
            creatorType: 'official',
            status: 'draft',
            category: dto.category,
            sourceType: 'official',
            runtimeType: 'openclaw',
            userId: adminId,
        });
        const saved = await this.agentRepo.save(agent);
        return (await this.toAdminAgentItems([saved]))[0];
    }
    async updateAgent(id, dto) {
        const agent = await this.agentRepo.findOne({ where: { id } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'Agent 不存在');
        }
        if (dto.name !== undefined)
            agent.name = dto.name;
        if (dto.description !== undefined)
            agent.description = dto.description;
        if (dto.systemPrompt !== undefined)
            agent.systemPrompt = dto.systemPrompt;
        if (dto.usageExamples !== undefined) {
            agent.usageExample = dto.usageExamples.join('\n') || undefined;
        }
        if (dto.modelId !== undefined)
            agent.modelId = dto.modelId;
        if (dto.category !== undefined)
            agent.category = dto.category;
        if (dto.pricePerCall !== undefined)
            agent.pricePerCall = dto.pricePerCall;
        if (dto.pricingMode !== undefined) {
            if (dto.pricingMode === 'perToken') {
                agent.pricePerToken = {
                    input: dto.pricePerTokenInput ?? 0,
                    output: dto.pricePerTokenOutput ?? 0,
                };
            }
            else {
                agent.pricePerToken = undefined;
            }
        }
        await this.agentRepo.save(agent);
    }
    async deleteAgent(id) {
        const agent = await this.agentRepo.findOne({ where: { id } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'Agent 不存在');
        }
        if (agent.status === 'published') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '已上架 Agent 不能删除，请先下架');
        }
        await this.agentRepo.delete(id);
    }
    async publishAgent(id) {
        const agent = await this.agentRepo.findOne({ where: { id } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'Agent 不存在');
        }
        this.assertTransition(agent.status, 'published', '上架');
        agent.status = 'published';
        agent.publishedAt = new Date();
        await this.agentRepo.save(agent);
    }
    async unpublishAgent(id) {
        const agent = await this.agentRepo.findOne({ where: { id } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'Agent 不存在');
        }
        this.assertTransition(agent.status, 'offline', '下架');
        agent.status = 'offline';
        await this.agentRepo.save(agent);
    }
    async listReview(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.agentRepo.createQueryBuilder('a');
        if (query.status) {
            const entityStatus = this.toEntityStatus(query.status);
            if (entityStatus) {
                qb.andWhere('a.status = :status', { status: entityStatus });
            }
        }
        else {
            qb.andWhere('a.status = :status', { status: 'pending_review' });
        }
        qb.orderBy('a.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [agents, total] = await qb.getManyAndCount();
        const list = await this.toAdminAgentItems(agents);
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async approveAgent(id, adminId) {
        const agent = await this.agentRepo.findOne({ where: { id } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'Agent 不存在');
        }
        this.assertTransition(agent.status, 'approved', '审核通过');
        agent.status = 'approved';
        agent.rejectionReason = undefined;
        await this.agentRepo.save(agent);
        await this.reviewRepo.save({
            agentId: id,
            reviewerId: adminId,
            action: 'approve',
        });
    }
    async rejectAgent(id, dto, adminId) {
        const agent = await this.agentRepo.findOne({ where: { id } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'Agent 不存在');
        }
        this.assertTransition(agent.status, 'rejected', '驳回');
        agent.status = 'rejected';
        agent.rejectionReason = dto.reason;
        await this.agentRepo.save(agent);
        await this.reviewRepo.save({
            agentId: id,
            reviewerId: adminId,
            action: 'reject',
            reason: dto.reason,
        });
    }
    async forceUnpublishAgent(id, dto, adminId) {
        const agent = await this.agentRepo.findOne({ where: { id } });
        if (!agent) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'Agent 不存在');
        }
        if (agent.status !== 'published' && agent.status !== 'approved') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, `当前状态 ${agent.status} 不允许强制下架`);
        }
        agent.status = 'offline';
        agent.rejectionReason = dto.reason;
        await this.agentRepo.save(agent);
        await this.reviewRepo.save({
            agentId: id,
            reviewerId: adminId,
            action: 'reject',
            reason: dto.reason,
        });
    }
    async importGithub(dto) {
        const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
        if (!GITHUB_URL_REGEX.test(dto.repoUrl)) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, 'Invalid GitHub repository URL');
        }
        const taskId = `imp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const defaults = {
            targetStatus: dto.targetStatus || 'published',
            defaultModelId: dto.defaultModelId || agent_import_constants_1.DEFAULT_MODEL_ID,
            defaultCreatorId: dto.defaultCreatorId || agent_import_constants_1.DEFAULT_CREATOR_ID,
            dryRun: dto.dryRun ?? false,
            overwriteExisting: dto.overwriteExisting ?? false,
        };
        const stats = {
            total: 0,
            inserted: 0,
            skipped: 0,
            failed: 0,
            durationMs: 0,
            errors: [],
        };
        await this.agentImportTaskRepo.save({
            taskId,
            repoUrl: dto.repoUrl,
            branch: 'main',
            status: 'processing',
            progress: 0,
            stats,
        });
        void this.processImportTask(taskId, dto, defaults).catch((e) => {
            this.logger?.error?.(`importGithub async dispatch failed: ${e.message}`);
        });
        return { taskId };
    }
    async processImportTask(taskId, dto, defaults) {
        const startTime = Date.now();
        const tmpDir = path.join(os.tmpdir(), `agent-import-${taskId}`);
        const stats = {
            total: 0,
            inserted: 0,
            skipped: 0,
            failed: 0,
            durationMs: 0,
            errors: [],
        };
        let commitSha;
        try {
            const cloneUrl = await this.resolveCloneUrl(dto.repoUrl);
            await execFileAsync('git', ['clone', '--depth', '1', cloneUrl, tmpDir], { timeout: agent_import_constants_1.CLONE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
            const { stdout: shaStdout } = await execFileAsync('git', ['-C', tmpDir, 'rev-parse', 'HEAD']);
            commitSha = shaStdout.trim();
            const files = await (0, fast_glob_1.default)([
                ...agent_import_constants_1.SOURCE_DIRS_TO_SCAN.map((d) => `${d}/**/*.md`),
                ...agent_import_constants_1.EXCLUDE_PATTERNS.map((p) => '!' + p),
            ], { cwd: tmpDir, ignore: agent_import_constants_1.EXCLUDE_PATTERNS });
            stats.total = files.length;
            const parsed = [];
            for (const relPath of files) {
                try {
                    const content = await fs.readFile(path.join(tmpDir, relPath), 'utf8');
                    const result = (0, agent_import_parser_1.parseAgentMarkdown)(relPath, content);
                    if (result.error) {
                        stats.failed++;
                        if (stats.errors && stats.errors.length < 50) {
                            stats.errors.push({ filePath: relPath, error: result.error });
                        }
                        continue;
                    }
                    const sourceDir = relPath.split('/')[0];
                    const category = agent_import_constants_1.SOURCE_DIR_TO_CATEGORY[sourceDir] || 'other';
                    parsed.push({ relPath, data: result, category });
                }
                catch (e) {
                    stats.failed++;
                    if (stats.errors && stats.errors.length < 50) {
                        stats.errors.push({ filePath: relPath, error: e.message });
                    }
                }
            }
            const existingMap = new Map();
            if (parsed.length > 0) {
                const existing = await this.agentRepo.find({
                    where: {
                        sourceRepoUrl: dto.repoUrl,
                        sourceFilePath: (0, typeorm_2.In)(parsed.map((p) => p.relPath)),
                    },
                    select: ['id', 'sourceFilePath'],
                });
                for (const e of existing) {
                    if (e.sourceFilePath) {
                        existingMap.set(e.sourceFilePath, { id: e.id });
                    }
                }
            }
            const newEntities = [];
            const updatePayloads = [];
            for (const item of parsed) {
                const existing = existingMap.get(item.relPath);
                const sourceDir = item.relPath.split('/')[0];
                if (existing) {
                    if (!defaults.overwriteExisting) {
                        stats.skipped++;
                        continue;
                    }
                    updatePayloads.push({
                        id: existing.id,
                        fields: {
                            name: item.data.name,
                            description: item.data.description,
                            avatar: item.data.avatar || undefined,
                            systemPrompt: item.data.systemPrompt,
                            modelId: defaults.defaultModelId,
                            category: item.category,
                            sourceCategory: sourceDir,
                            sourceVersion: commitSha,
                        },
                    });
                }
                else {
                    const entity = this.agentRepo.create({
                        name: item.data.name,
                        description: item.data.description,
                        avatar: item.data.avatar || undefined,
                        systemPrompt: item.data.systemPrompt,
                        modelId: defaults.defaultModelId,
                        pricePerCall: agent_import_constants_1.DEFAULT_PRICE_PER_CALL,
                        creatorId: defaults.defaultCreatorId,
                        creatorType: 'official',
                        status: defaults.targetStatus,
                        category: item.category,
                        sourceType: 'imported',
                        sourceRepoUrl: dto.repoUrl,
                        sourceFilePath: item.relPath,
                        sourceCategory: sourceDir,
                        sourceVersion: commitSha,
                        runtimeType: agent_import_constants_1.DEFAULT_RUNTIME_TYPE,
                        userId: defaults.defaultCreatorId,
                        isOfficial: true,
                        publishedAt: defaults.targetStatus === 'published' ? new Date() : undefined,
                    });
                    newEntities.push(entity);
                }
            }
            if (defaults.dryRun) {
                stats.inserted = 0;
                stats.skipped = existingMap.size;
            }
            else {
                let processedCount = 0;
                for (let i = 0; i < newEntities.length; i += agent_import_constants_1.BATCH_SIZE) {
                    const batch = newEntities.slice(i, i + agent_import_constants_1.BATCH_SIZE);
                    await this.agentRepo.save(batch);
                    processedCount += batch.length;
                    const progress = files.length > 0
                        ? Math.floor((processedCount / files.length) * 100)
                        : 100;
                    await this.agentImportTaskRepo.update({ taskId }, { progress, stats });
                }
                stats.inserted = newEntities.length;
                for (let i = 0; i < updatePayloads.length; i += agent_import_constants_1.BATCH_SIZE) {
                    const batch = updatePayloads.slice(i, i + agent_import_constants_1.BATCH_SIZE);
                    for (const payload of batch) {
                        await this.agentRepo.update(payload.id, payload.fields);
                    }
                    processedCount += batch.length;
                    const progress = files.length > 0
                        ? Math.floor((processedCount / files.length) * 100)
                        : 100;
                    await this.agentImportTaskRepo.update({ taskId }, { progress, stats });
                }
            }
            stats.durationMs = Date.now() - startTime;
            stats.total = files.length;
            await this.agentImportTaskRepo.update({ taskId }, {
                status: 'success',
                progress: 100,
                stats,
                commitSha,
            });
        }
        catch (e) {
            stats.durationMs = Date.now() - startTime;
            await this.agentImportTaskRepo.update({ taskId }, {
                status: 'failed',
                error: e.message.slice(0, 512),
                stats,
            });
        }
        finally {
            try {
                await fs.rm(tmpDir, { recursive: true, force: true });
            }
            catch {
            }
        }
    }
    async getImportTask(taskId) {
        const task = await this.agentImportTaskRepo.findOne({ where: { taskId } });
        if (!task) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '导入任务不存在');
        }
        return {
            taskId: task.taskId,
            status: task.status,
            progress: task.progress,
            repoUrl: task.repoUrl,
            branch: task.branch,
            commitSha: task.commitSha,
            stats: task.stats,
            errorMessage: task.error,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
        };
    }
    async resolveCloneUrl(url) {
        try {
            await execFileAsync('git', ['ls-remote', url, 'HEAD'], {
                timeout: 5_000,
                maxBuffer: 10 * 1024 * 1024,
            });
            return url;
        }
        catch {
            this.logger.warn('直连 GitHub 失败，尝试使用镜像加速...');
        }
        const mirrored = `https://gh-proxy.com/${url}`;
        this.logger.log(`使用镜像: ${mirrored}`);
        return mirrored;
    }
    async listCategories() {
        const categories = await this.categoryRepo.find({ order: { sort: 'ASC' } });
        const categoryMap = new Map(categories.map((c) => [c.category, c]));
        const countRows = await this.agentRepo
            .createQueryBuilder('a')
            .select('a.category', 'category')
            .addSelect('COUNT(*)', 'cnt')
            .groupBy('a.category')
            .getRawMany();
        const countMap = new Map(countRows.map((r) => [r.category, Number(r.cnt)]));
        return FIXED_CATEGORIES.map((cat, idx) => {
            const meta = categoryMap.get(cat);
            return {
                category: cat,
                displayName: meta?.displayName || DEFAULT_DISPLAY_NAMES[cat] || cat,
                agentCount: countMap.get(cat) || 0,
                sort: meta?.sort ?? idx,
            };
        });
    }
    async updateCategoryDisplay(category, dto) {
        if (!FIXED_CATEGORIES.includes(category)) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '无效的分类');
        }
        let entity = await this.categoryRepo.findOne({ where: { category } });
        if (entity) {
            entity.displayName = dto.displayName;
            await this.categoryRepo.save(entity);
        }
        else {
            entity = this.categoryRepo.create({
                category,
                displayName: dto.displayName,
                sort: FIXED_CATEGORIES.indexOf(category),
            });
            await this.categoryRepo.save(entity);
        }
    }
    assertTransition(currentStatus, targetStatus, actionDesc) {
        const allowed = VALID_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(targetStatus)) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, `当前状态 ${currentStatus} 不允许${actionDesc}（目标状态 ${targetStatus}）`);
        }
    }
    toEntityStatus(status) {
        switch (status) {
            case 'published':
                return 'published';
            case 'unpublished':
                return 'offline';
            case 'pending_review':
                return 'pending_review';
            case 'approved':
                return 'approved';
            case 'rejected':
                return 'rejected';
            case 'draft':
                return 'draft';
            default:
                return null;
        }
    }
    toFrontendStatus(status) {
        switch (status) {
            case 'published':
                return 'published';
            case 'offline':
                return 'unpublished';
            case 'pending_review':
                return 'pending_review';
            case 'approved':
                return 'approved';
            case 'rejected':
                return 'rejected';
            default:
                return 'unpublished';
        }
    }
    async toAdminAgentItems(agents) {
        if (agents.length === 0)
            return [];
        const creatorIds = [...new Set(agents.map((a) => a.creatorId).filter((id) => id > 0))];
        const creators = creatorIds.length > 0
            ? await this.userRepo
                .createQueryBuilder('u')
                .select(['u.id', 'u.username'])
                .where('u.id IN (:...ids)', { ids: creatorIds })
                .getMany()
            : [];
        const nameMap = new Map(creators.map((u) => [u.id, u.username]));
        return agents.map((a) => {
            const pricingMode = a.pricePerToken ? 'perToken' : 'perCall';
            return {
                id: a.id,
                name: a.name,
                description: a.description || '',
                systemPrompt: a.systemPrompt,
                category: a.category,
                usageExamples: a.usageExample ? a.usageExample.split('\n').filter(Boolean) : undefined,
                modelId: a.modelId,
                creatorType: a.creatorType,
                creatorName: nameMap.get(a.creatorId) || '',
                status: this.toFrontendStatus(a.status),
                pricingMode,
                pricePerCall: a.pricePerCall,
                pricePerTokenInput: a.pricePerToken?.input ?? 0,
                pricePerTokenOutput: a.pricePerToken?.output ?? 0,
                callCount: a.callCount,
                rating: Number(a.rating) || 0,
                rejectReason: a.rejectionReason || undefined,
                forceUnpublishReason: a.status === 'offline' ? a.rejectionReason || undefined : undefined,
                submittedAt: a.publishedAt?.toISOString(),
                createdAt: a.createdAt.toISOString(),
                updatedAt: a.updatedAt.toISOString(),
            };
        });
    }
};
exports.AdminAgentService = AdminAgentService;
exports.AdminAgentService = AdminAgentService = AdminAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(agent_entity_1.AgentEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(agent_review_entity_1.AgentReviewEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(agent_category_entity_1.AgentCategoryEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(agent_import_task_entity_1.AgentImportTaskEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], AdminAgentService);
//# sourceMappingURL=admin-agent.service.js.map