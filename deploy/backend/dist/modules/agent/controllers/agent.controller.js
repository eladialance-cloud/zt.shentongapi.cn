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
exports.AgentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const agent_entity_1 = require("../entities/agent.entity");
const agent_favorite_entity_1 = require("../entities/agent-favorite.entity");
const agent_call_log_entity_1 = require("../entities/agent-call-log.entity");
const agent_review_entity_1 = require("../entities/agent-review.entity");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
let AgentController = class AgentController {
    agentRepo;
    favoriteRepo;
    callLogRepo;
    reviewRepo;
    constructor(agentRepo, favoriteRepo, callLogRepo, reviewRepo) {
        this.agentRepo = agentRepo;
        this.favoriteRepo = favoriteRepo;
        this.callLogRepo = callLogRepo;
        this.reviewRepo = reviewRepo;
    }
    health() {
        return { status: 'ok', module: 'agent' };
    }
    async list(page, pageSize, category, keyword, sort) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const qb = this.agentRepo.createQueryBuilder('a');
        qb.where('a.status = :status', { status: 'published' });
        qb.andWhere('a.official_visible = :visible', { visible: true });
        if (category) {
            qb.andWhere('a.category = :category', { category });
        }
        if (keyword) {
            qb.andWhere('(a.name LIKE :kw OR a.description LIKE :kw)', { kw: `%${keyword}%` });
        }
        switch (sort) {
            case 'popular':
                qb.orderBy('a.call_count', 'DESC');
                break;
            case 'rating':
                qb.orderBy('a.rating', 'DESC');
                break;
            case 'newest':
            default:
                qb.orderBy('a.published_at', 'DESC');
                break;
        }
        qb.skip((p - 1) * ps).take(ps);
        const [agents, total] = await qb.getManyAndCount();
        return {
            list: agents.map(a => ({
                id: a.id,
                name: a.name,
                description: a.description || '',
                avatar: a.avatar,
                category: a.category,
                tags: a.tags || [],
                modelId: a.modelId,
                pricePerCall: a.pricePerCall,
                rating: Number(a.rating) || 0,
                ratingCount: a.ratingCount,
                callCount: a.callCount,
                isOfficial: a.isOfficial,
                sourceCategory: a.sourceCategory,
            })),
            total,
            page: p,
            pageSize: ps,
            totalPages: Math.ceil(total / ps),
        };
    }
    async categories() {
        const rows = await this.agentRepo
            .createQueryBuilder('a')
            .select('a.category', 'category')
            .addSelect('COUNT(*)', 'cnt')
            .where('a.status = :status', { status: 'published' })
            .andWhere('a.official_visible = :visible', { visible: true })
            .groupBy('a.category')
            .getRawMany();
        const displayNames = {
            office: '办公',
            programming: '编程',
            copywriting: '文案',
            data_analysis: '数据分析',
            other: '其他',
        };
        return rows.map(r => ({
            category: r.category,
            displayName: displayNames[r.category] || r.category,
            agentCount: Number(r.cnt),
        }));
    }
    async listFavorites(user) {
        const favs = await this.favoriteRepo.find({
            where: { userId: user.userId },
            order: { createdAt: 'DESC' },
        });
        if (favs.length === 0)
            return [];
        const agentIds = favs.map((f) => f.agentId);
        const agents = await this.agentRepo.find({
            where: agentIds.map((id) => ({ id })),
        });
        return agents.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description || '',
            avatar: a.avatar,
            category: a.category,
            tags: a.tags || [],
            rating: Number(a.rating) || 0,
            callCount: a.callCount,
            isOfficial: a.isOfficial,
            isFavorited: true,
        }));
    }
    async favorite(id, user) {
        const exists = await this.favoriteRepo.findOne({
            where: { userId: user.userId, agentId: id },
        });
        if (!exists) {
            await this.favoriteRepo.save({
                userId: user.userId,
                agentId: id,
            });
        }
        return { success: true };
    }
    async unfavorite(id, user) {
        await this.favoriteRepo.delete({
            userId: user.userId,
            agentId: id,
        });
        return { success: true };
    }
    async usageLogs(user, page, pageSize) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const [list, total] = await this.callLogRepo.findAndCount({
            where: { userId: user.userId },
            order: { createdAt: 'DESC' },
            skip: (p - 1) * ps,
            take: ps,
        });
        return { list, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
    }
    async listReviews(id) {
        return this.reviewRepo.find({
            where: { agentId: id },
            order: { createdAt: 'DESC' },
        });
    }
    async createReview(id, body, user) {
        const review = await this.reviewRepo.save({
            agentId: id,
            reviewerId: user.userId,
            action: 'approve',
            reason: body.comment || '',
        });
        return review;
    }
    async detail(id) {
        const agent = await this.agentRepo.findOne({
            where: { id },
            select: [
                'id',
                'name',
                'description',
                'avatar',
                'usageExample',
                'category',
                'tags',
                'modelId',
                'pricePerCall',
                'rating',
                'ratingCount',
                'callCount',
                'isOfficial',
                'sourceCategory',
                'sourceName',
                'createdAt',
                'publishedAt',
            ],
        });
        if (!agent) {
            return { code: 404, message: 'Agent 不存在', data: null };
        }
        return {
            id: agent.id,
            name: agent.name,
            description: agent.description || '',
            avatar: agent.avatar,
            usageExample: agent.usageExample,
            category: agent.category,
            tags: agent.tags || [],
            modelId: agent.modelId,
            pricePerCall: agent.pricePerCall,
            rating: Number(agent.rating) || 0,
            ratingCount: agent.ratingCount,
            callCount: agent.callCount,
            isOfficial: agent.isOfficial,
            sourceCategory: agent.sourceCategory,
            sourceName: agent.sourceName,
            createdAt: agent.createdAt?.toISOString(),
            publishedAt: agent.publishedAt?.toISOString(),
        };
    }
};
exports.AgentController = AgentController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AgentController.prototype, "health", null);
__decorate([
    (0, common_1.Get)(),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '获取已上架 Agent 列表' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __param(2, (0, common_1.Query)('category')),
    __param(3, (0, common_1.Query)('keyword')),
    __param(4, (0, common_1.Query)('sort')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('categories'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '获取 Agent 分类列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "categories", null);
__decorate([
    (0, common_1.Get)('me/favorites'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '我的收藏列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "listFavorites", null);
__decorate([
    (0, common_1.Post)(':id/favorite'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '收藏 Agent' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "favorite", null);
__decorate([
    (0, common_1.Delete)(':id/favorite'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '取消收藏' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "unfavorite", null);
__decorate([
    (0, common_1.Get)('me/usage-logs'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '我的使用记录' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "usageLogs", null);
__decorate([
    (0, common_1.Get)(':id/reviews'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '获取 Agent 评价列表' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "listReviews", null);
__decorate([
    (0, common_1.Post)(':id/reviews'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '创建评价' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "createReview", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '获取 Agent 详情' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AgentController.prototype, "detail", null);
exports.AgentController = AgentController = __decorate([
    (0, swagger_1.ApiTags)('Agent智能体'),
    (0, common_1.Controller)('agents'),
    __param(0, (0, typeorm_1.InjectRepository)(agent_entity_1.AgentEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(agent_favorite_entity_1.AgentFavoriteEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(agent_call_log_entity_1.AgentCallLogEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(agent_review_entity_1.AgentReviewEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], AgentController);
//# sourceMappingURL=agent.controller.js.map