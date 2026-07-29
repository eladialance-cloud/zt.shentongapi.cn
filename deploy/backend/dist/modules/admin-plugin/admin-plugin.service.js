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
exports.AdminPluginService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
const plugin_entity_1 = require("../plugin/entities/plugin.entity");
let AdminPluginService = class AdminPluginService {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async list(query) {
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const qb = this.repo.createQueryBuilder('p');
        if (query.status === 'published') {
            qb.andWhere('p.is_active = :active', { active: true });
        }
        else if (query.status === 'unpublished') {
            qb.andWhere('p.is_active = :active', { active: false });
        }
        qb.orderBy('p.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [rows, total] = await qb.getManyAndCount();
        return {
            list: rows.map((r) => this.toItem(r)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async detail(id) {
        const plugin = await this.repo.findOne({ where: { id } });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在`);
        }
        return this.toItem(plugin);
    }
    async create(dto) {
        const entity = this.repo.create({
            name: dto.name,
            description: dto.description,
            type: dto.type,
            version: dto.version,
            mcpServerUrl: dto.entryPoint,
            sandboxConfig: dto.sandboxConfig,
            pricingMode: dto.pricingMode,
            pricePerCall: dto.pricePerCall,
            pricePerTokenInput: dto.pricePerTokenInput,
            pricePerTokenOutput: dto.pricePerTokenOutput,
            isOfficial: false,
            isActive: false,
            reviewStatus: 'pending',
        });
        const saved = await this.repo.save(entity);
        return this.toItem(saved);
    }
    async update(id, dto) {
        const plugin = await this.repo.findOne({ where: { id } });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在`);
        }
        if (dto.name !== undefined)
            plugin.name = dto.name;
        if (dto.description !== undefined)
            plugin.description = dto.description;
        if (dto.type !== undefined)
            plugin.type = dto.type;
        if (dto.version !== undefined)
            plugin.version = dto.version;
        if (dto.entryPoint !== undefined)
            plugin.mcpServerUrl = dto.entryPoint;
        if (dto.sandboxConfig !== undefined)
            plugin.sandboxConfig = dto.sandboxConfig;
        if (dto.pricingMode !== undefined)
            plugin.pricingMode = dto.pricingMode;
        if (dto.pricePerCall !== undefined)
            plugin.pricePerCall = dto.pricePerCall;
        if (dto.pricePerTokenInput !== undefined)
            plugin.pricePerTokenInput = dto.pricePerTokenInput;
        if (dto.pricePerTokenOutput !== undefined)
            plugin.pricePerTokenOutput = dto.pricePerTokenOutput;
        await this.repo.save(plugin);
    }
    async remove(id) {
        const plugin = await this.repo.findOne({ where: { id } });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在`);
        }
        await this.repo.delete(id);
    }
    async publish(id) {
        const plugin = await this.repo.findOne({ where: { id } });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在`);
        }
        plugin.isActive = true;
        await this.repo.save(plugin);
    }
    async unpublish(id) {
        const plugin = await this.repo.findOne({ where: { id } });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在`);
        }
        plugin.isActive = false;
        await this.repo.save(plugin);
    }
    async listReview(query) {
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const qb = this.repo.createQueryBuilder('p');
        const status = query.status || 'pending';
        qb.andWhere('p.review_status = :status', { status });
        qb.orderBy('p.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [rows, total] = await qb.getManyAndCount();
        return {
            list: rows.map((r) => this.toItem(r)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async approve(id) {
        const plugin = await this.repo.findOne({ where: { id } });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在`);
        }
        if (plugin.reviewStatus === 'approved') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '该插件已通过审核');
        }
        if (plugin.reviewStatus !== 'pending') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '仅待审核状态可通过');
        }
        plugin.reviewStatus = 'approved';
        plugin.rejectReason = undefined;
        plugin.isActive = true;
        await this.repo.save(plugin);
    }
    async reject(id, reason) {
        const plugin = await this.repo.findOne({ where: { id } });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在`);
        }
        if (plugin.reviewStatus === 'rejected') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '该插件已驳回');
        }
        if (plugin.reviewStatus !== 'pending') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '仅待审核状态可驳回');
        }
        plugin.reviewStatus = 'rejected';
        plugin.rejectReason = reason;
        plugin.isActive = false;
        await this.repo.save(plugin);
    }
    async review(id, action, reason) {
        if (action === 'approve') {
            await this.approve(id);
        }
        else {
            await this.reject(id, reason || '');
        }
    }
    async listSyncStatus(query) {
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const [rows, total] = await this.repo.findAndCount({
            order: { createdAt: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return {
            list: rows.map((r) => this.toSyncStatusItem(r)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async sync(id) {
        const plugin = await this.repo.findOne({ where: { id } });
        if (!plugin) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `插件 ${id} 不存在`);
        }
        return { synced: true, count: 0 };
    }
    async syncAll() {
        return { synced: true, count: 0 };
    }
    toItem(p) {
        return {
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            type: p.type ?? 'tool',
            version: p.version,
            entryPoint: p.mcpServerUrl,
            status: p.isActive ? 'published' : 'unpublished',
            reviewStatus: p.reviewStatus,
            creatorName: undefined,
            isOfficial: p.isOfficial,
            pricingMode: p.pricingMode,
            pricePerCall: Number(p.pricePerCall ?? 0),
            pricePerTokenInput: Number(p.pricePerTokenInput ?? 0),
            pricePerTokenOutput: Number(p.pricePerTokenOutput ?? 0),
            callCount: 0,
            rejectReason: p.rejectReason,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
        };
    }
    toSyncStatusItem(p) {
        return {
            id: p.id,
            name: p.name,
            type: 'tool',
            syncStatus: 'synced',
            lastSyncedAt: p.updatedAt,
            errorMessage: undefined,
        };
    }
};
exports.AdminPluginService = AdminPluginService;
exports.AdminPluginService = AdminPluginService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(plugin_entity_1.PluginEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AdminPluginService);
//# sourceMappingURL=admin-plugin.service.js.map