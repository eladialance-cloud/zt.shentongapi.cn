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
exports.AdminModelService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const model_entity_1 = require("../model/entities/model.entity");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
const encryption_service_1 = require("../../common/services/encryption.service");
const MODEL_PROVIDERS = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'doubao', label: '豆包' },
    { value: 'qwen', label: '通义千问' },
    { value: 'deepseek', label: 'DeepSeek' },
    { value: 'other', label: '其他' },
];
let AdminModelService = class AdminModelService {
    modelRepo;
    encryptionService;
    constructor(modelRepo, encryptionService) {
        this.modelRepo = modelRepo;
        this.encryptionService = encryptionService;
    }
    async list(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.modelRepo.createQueryBuilder('m');
        if (query.provider) {
            qb.andWhere('m.provider = :provider', { provider: query.provider });
        }
        if (query.enabled === true || query.enabled === 'true') {
            qb.andWhere('m.is_active = :active', { active: true });
        }
        else if (query.enabled === false || query.enabled === 'false') {
            qb.andWhere('m.is_active = :active', { active: false });
        }
        qb.orderBy('m.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return {
            list: items.map((m) => this.toAdminModelItem(m)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async detail(id) {
        const model = await this.modelRepo.findOne({ where: { id } });
        if (!model) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '模型不存在');
        }
        return this.toAdminModelItem(model);
    }
    async create(dto) {
        const entity = new model_entity_1.ModelEntity();
        this.applyCreateDto(entity, dto);
        const saved = await this.modelRepo.save(entity);
        return this.toAdminModelItem(saved);
    }
    async update(id, dto) {
        const model = await this.modelRepo.findOne({ where: { id } });
        if (!model) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '模型不存在');
        }
        this.applyUpdateDto(model, dto);
        await this.modelRepo.save(model);
    }
    async remove(id) {
        const model = await this.modelRepo.findOne({ where: { id } });
        if (!model) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '模型不存在');
        }
        await this.modelRepo.delete(id);
    }
    async enable(id) {
        const model = await this.modelRepo.findOne({ where: { id } });
        if (!model) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '模型不存在');
        }
        model.isActive = true;
        await this.modelRepo.save(model);
    }
    async disable(id) {
        const model = await this.modelRepo.findOne({ where: { id } });
        if (!model) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '模型不存在');
        }
        model.isActive = false;
        await this.modelRepo.save(model);
    }
    async test(id, _dto) {
        const model = await this.modelRepo.findOne({ where: { id } });
        if (!model) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '模型不存在');
        }
        return { success: true, response: 'test ok' };
    }
    async sync(id) {
        const model = await this.modelRepo.findOne({ where: { id } });
        if (!model) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '模型不存在');
        }
    }
    providers() {
        return MODEL_PROVIDERS;
    }
    applyCreateDto(entity, dto) {
        entity.provider = dto.provider;
        entity.modelId = dto.modelId;
        entity.name = dto.displayName;
        entity.pricePer1kInput = dto.inputPricePerToken;
        entity.pricePer1kOutput = dto.outputPricePerToken;
        entity.isActive = dto.enabled;
        entity.supportsVision = dto.capabilities?.includes('vision') ?? false;
        entity.supportsFunctions = dto.capabilities?.includes('function_calling') ?? false;
        if (dto.apiKey !== undefined) {
            entity.apiKey = this.encryptionService.encryptAes(dto.apiKey);
        }
        if (dto.apiEndpoint !== undefined)
            entity.apiEndpoint = dto.apiEndpoint;
    }
    applyUpdateDto(entity, dto) {
        if (dto.provider !== undefined)
            entity.provider = dto.provider;
        if (dto.modelId !== undefined)
            entity.modelId = dto.modelId;
        if (dto.displayName !== undefined)
            entity.name = dto.displayName;
        if (dto.inputPricePerToken !== undefined)
            entity.pricePer1kInput = dto.inputPricePerToken;
        if (dto.outputPricePerToken !== undefined)
            entity.pricePer1kOutput = dto.outputPricePerToken;
        if (dto.enabled !== undefined)
            entity.isActive = dto.enabled;
        if (dto.capabilities !== undefined) {
            entity.supportsVision = dto.capabilities.includes('vision');
            entity.supportsFunctions = dto.capabilities.includes('function_calling');
        }
        if (dto.apiKey !== undefined) {
            entity.apiKey = this.encryptionService.encryptAes(dto.apiKey);
        }
        if (dto.apiEndpoint !== undefined)
            entity.apiEndpoint = dto.apiEndpoint;
    }
    toAdminModelItem(m) {
        const capabilities = [];
        if (m.supportsVision)
            capabilities.push('vision');
        if (m.supportsFunctions)
            capabilities.push('function_calling');
        return {
            id: m.id,
            provider: m.provider,
            modelId: m.modelId,
            displayName: m.name,
            apiKeyMasked: undefined,
            apiEndpoint: undefined,
            inputPricePerToken: m.pricePer1kInput ?? 0,
            outputPricePerToken: m.pricePer1kOutput ?? 0,
            minUserLevel: 1,
            enabled: m.isActive,
            syncStatus: 'synced',
            syncErrorMessage: undefined,
            capabilities,
            concurrencyLimit: undefined,
            rateLimitPerMinute: undefined,
            lastSyncedAt: undefined,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
        };
    }
};
exports.AdminModelService = AdminModelService;
exports.AdminModelService = AdminModelService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(model_entity_1.ModelEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        encryption_service_1.EncryptionService])
], AdminModelService);
//# sourceMappingURL=admin-model.service.js.map