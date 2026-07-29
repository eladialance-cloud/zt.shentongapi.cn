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
var ModelService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const model_entity_1 = require("../entities/model.entity");
const redis_service_1 = require("../../../common/services/redis.service");
const encryption_service_1 = require("../../../common/services/encryption.service");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let ModelService = class ModelService {
    static { ModelService_1 = this; }
    modelRepo;
    redis;
    encryption;
    static CACHE_KEY = 'cache:model:list';
    static CACHE_TTL = 600;
    constructor(modelRepo, redis, encryption) {
        this.modelRepo = modelRepo;
        this.redis = redis;
        this.encryption = encryption;
    }
    async listAvailableModels() {
        const cached = await this.redis.get(ModelService_1.CACHE_KEY);
        if (cached) {
            try {
                return JSON.parse(cached);
            }
            catch {
            }
        }
        const models = await this.modelRepo.find({
            where: { isActive: true },
            order: { provider: 'ASC', name: 'ASC' },
        });
        const result = models.map((m) => this.toSafeModel(m));
        await this.redis.set(ModelService_1.CACHE_KEY, JSON.stringify(result), ModelService_1.CACHE_TTL);
        return result;
    }
    async detail(modelId) {
        const model = await this.modelRepo.findOne({
            where: { modelId, isActive: true },
        });
        if (!model) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '模型不存在');
        }
        return this.toSafeModel(model);
    }
    async create(data) {
        if (data.apiKey) {
            data = { ...data, apiKey: this.encryption.encryptAes(data.apiKey) };
        }
        const model = this.modelRepo.create(data);
        const saved = await this.modelRepo.save(model);
        await this.redis.del(ModelService_1.CACHE_KEY);
        return saved;
    }
    async update(id, data) {
        if (data.apiKey) {
            data = { ...data, apiKey: this.encryption.encryptAes(data.apiKey) };
        }
        await this.modelRepo.update(id, data);
        await this.redis.del(ModelService_1.CACHE_KEY);
    }
    async remove(id) {
        await this.modelRepo.delete(id);
        await this.redis.del(ModelService_1.CACHE_KEY);
    }
    health() {
        return { status: 'ok', module: 'model' };
    }
    toSafeModel(m) {
        return {
            id: m.id,
            provider: m.provider,
            modelId: m.modelId,
            name: m.name,
            description: m.description,
            contextWindow: m.contextWindow,
            maxTokens: m.maxTokens,
            supportsVision: m.supportsVision,
            supportsFunctions: m.supportsFunctions,
            pricePer1kInput: m.pricePer1kInput,
            pricePer1kOutput: m.pricePer1kOutput,
            isActive: m.isActive,
            concurrencyLimit: m.concurrencyLimit,
            rateLimitPerMinute: m.rateLimitPerMinute,
            minUserLevel: m.minUserLevel,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
        };
    }
};
exports.ModelService = ModelService;
exports.ModelService = ModelService = ModelService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(model_entity_1.ModelEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        redis_service_1.RedisService,
        encryption_service_1.EncryptionService])
], ModelService);
//# sourceMappingURL=model.service.js.map