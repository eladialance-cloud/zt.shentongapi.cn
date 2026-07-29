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
exports.WorkflowService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const workflow_entity_1 = require("../../admin-workflow/entities/workflow.entity");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let WorkflowService = class WorkflowService {
    workflowRepo;
    constructor(workflowRepo) {
        this.workflowRepo = workflowRepo;
    }
    async list(page = 1, pageSize = 20, category) {
        const qb = this.workflowRepo
            .createQueryBuilder('w')
            .where('w.is_active = :active', { active: true })
            .andWhere('w.review_status = :status', { status: 'approved' });
        if (category) {
            qb.andWhere('w.category = :category', { category });
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
        const workflow = await this.workflowRepo.findOne({
            where: { id, isActive: true, reviewStatus: 'approved' },
        });
        if (!workflow) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `工作流 ${id} 不存在或未通过审核`);
        }
        return workflow;
    }
    async execute(id, userId, input) {
        return {
            workflowId: id,
            status: 'pending',
            message: '工作流执行引擎待实现',
        };
    }
    health() {
        return { status: 'ok', module: 'workflow' };
    }
};
exports.WorkflowService = WorkflowService;
exports.WorkflowService = WorkflowService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(workflow_entity_1.WorkflowEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], WorkflowService);
//# sourceMappingURL=workflow.service.js.map