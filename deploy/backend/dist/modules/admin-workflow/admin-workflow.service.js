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
exports.AdminWorkflowService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const workflow_entity_1 = require("./entities/workflow.entity");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
let AdminWorkflowService = class AdminWorkflowService {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async list(query) {
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const qb = this.repo.createQueryBuilder('w');
        if (query.engineType) {
            qb.andWhere('w.engine_type = :engineType', {
                engineType: query.engineType,
            });
        }
        if (query.category) {
            qb.andWhere('w.category = :category', { category: query.category });
        }
        if (query.status) {
            qb.andWhere('w.review_status = :status', { status: query.status });
        }
        if (query.keyword) {
            qb.andWhere('(w.name LIKE :kw OR w.description LIKE :kw)', {
                kw: `%${query.keyword}%`,
            });
        }
        qb.orderBy('w.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [list, total] = await qb.getManyAndCount();
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async detail(id) {
        const workflow = await this.repo.findOne({ where: { id } });
        if (!workflow) {
            throw new common_1.NotFoundException(`工作流 ${id} 不存在`);
        }
        return workflow;
    }
    async create(dto) {
        const isActive = dto.isActive === true ? false : dto.isActive ?? false;
        const entity = this.repo.create({
            name: dto.name,
            description: dto.description,
            engineType: dto.engineType,
            n8nWorkflowId: dto.n8nWorkflowId,
            cozeWorkflowId: dto.cozeWorkflowId,
            category: dto.category,
            inputSchema: dto.inputSchema,
            outputSchema: dto.outputSchema,
            pricePerExecution: dto.pricePerExecution,
            isActive,
            reviewStatus: 'pending_review',
            executionCount: 0,
        });
        return this.repo.save(entity);
    }
    async update(id, dto) {
        const workflow = await this.repo.findOne({ where: { id } });
        if (!workflow) {
            throw new common_1.NotFoundException(`工作流 ${id} 不存在`);
        }
        if (dto.name !== undefined)
            workflow.name = dto.name;
        if (dto.description !== undefined)
            workflow.description = dto.description;
        if (dto.engineType !== undefined) {
            workflow.engineType = dto.engineType;
        }
        if (dto.n8nWorkflowId !== undefined)
            workflow.n8nWorkflowId = dto.n8nWorkflowId;
        if (dto.cozeWorkflowId !== undefined)
            workflow.cozeWorkflowId = dto.cozeWorkflowId;
        if (dto.category !== undefined) {
            workflow.category = dto.category;
        }
        if (dto.inputSchema !== undefined)
            workflow.inputSchema = dto.inputSchema;
        if (dto.outputSchema !== undefined)
            workflow.outputSchema = dto.outputSchema;
        if (dto.pricePerExecution !== undefined) {
            workflow.pricePerExecution = dto.pricePerExecution;
        }
        if (dto.isActive !== undefined) {
            if (dto.isActive && workflow.reviewStatus !== 'approved') {
                business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '工作流必须先通过审核才能上架');
            }
            workflow.isActive = dto.isActive;
        }
        await this.repo.save(workflow);
    }
    async remove(id) {
        const workflow = await this.repo.findOne({ where: { id } });
        if (!workflow) {
            throw new common_1.NotFoundException(`工作流 ${id} 不存在`);
        }
        await this.repo.delete(id);
    }
    async listReview(query) {
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const qb = this.repo
            .createQueryBuilder('w')
            .where('w.review_status = :status', {
            status: query.status || 'pending_review',
        })
            .orderBy('w.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [list, total] = await qb.getManyAndCount();
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async approve(id) {
        const workflow = await this.repo.findOne({ where: { id } });
        if (!workflow) {
            throw new common_1.NotFoundException(`工作流 ${id} 不存在`);
        }
        workflow.reviewStatus = 'approved';
        workflow.rejectReason = undefined;
        await this.repo.save(workflow);
    }
    async reject(id, reason) {
        const workflow = await this.repo.findOne({ where: { id } });
        if (!workflow) {
            throw new common_1.NotFoundException(`工作流 ${id} 不存在`);
        }
        workflow.reviewStatus = 'rejected';
        workflow.rejectReason = reason;
        workflow.isActive = false;
        await this.repo.save(workflow);
    }
    async review(id, action, reason) {
        if (action === 'approve') {
            await this.approve(id);
        }
        else {
            await this.reject(id, reason || '');
        }
    }
    async stats() {
        const total = await this.repo.count();
        const active = await this.repo.count({ where: { isActive: true } });
        const pending = await this.repo.count({
            where: { reviewStatus: 'pending_review' },
        });
        const approved = await this.repo.count({
            where: { reviewStatus: 'approved' },
        });
        const rejected = await this.repo.count({
            where: { reviewStatus: 'rejected' },
        });
        const byEngineRaw = await this.repo
            .createQueryBuilder('w')
            .select('w.engine_type', 'engineType')
            .addSelect('COUNT(*)', 'total')
            .addSelect('SUM(CASE WHEN w.is_active = true THEN 1 ELSE 0 END)', 'active')
            .addSelect('COALESCE(SUM(w.execution_count), 0)', 'executionCount')
            .groupBy('w.engine_type')
            .getRawMany();
        const byEngineType = byEngineRaw.map((r) => ({
            engineType: r.engineType,
            total: Number(r.total),
            active: Number(r.active),
            executionCount: Number(r.executionCount),
        }));
        const topRaw = await this.repo.find({
            order: { executionCount: 'DESC' },
            take: 10,
        });
        const topWorkflows = topRaw.map((w) => ({
            id: w.id,
            name: w.name,
            engineType: w.engineType,
            executionCount: w.executionCount,
        }));
        return {
            total,
            active,
            pending,
            approved,
            rejected,
            published: active,
            byEngineType,
            topWorkflows,
            executionTrend: [],
        };
    }
};
exports.AdminWorkflowService = AdminWorkflowService;
exports.AdminWorkflowService = AdminWorkflowService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(workflow_entity_1.WorkflowEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AdminWorkflowService);
//# sourceMappingURL=admin-workflow.service.js.map