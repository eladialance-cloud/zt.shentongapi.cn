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
var ApiKeyPoolService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyPoolService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const api_key_pool_entity_1 = require("../entities/api-key-pool.entity");
const encryption_service_1 = require("../../../common/services/encryption.service");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
const ERROR_THRESHOLD = 5;
let ApiKeyPoolService = ApiKeyPoolService_1 = class ApiKeyPoolService {
    keyRepo;
    encryption;
    logger = new common_1.Logger(ApiKeyPoolService_1.name);
    constructor(keyRepo, encryption) {
        this.keyRepo = keyRepo;
        this.encryption = encryption;
    }
    onModuleInit() {
        this.scheduleDaily(0, 0, () => this.resetDailyQuota().catch((e) => this.logger.error(`重置日配额失败: ${e?.message || e}`)));
        this.scheduleMonthly(() => this.resetMonthlyQuota().catch((e) => this.logger.error(`重置月配额失败: ${e?.message || e}`)));
        setInterval(() => this.checkBalance().catch((e) => this.logger.error(`余额检查失败: ${e?.message || e}`)), 10 * 60 * 1000);
    }
    async getNextAvailableKey(provider) {
        const key = await this.keyRepo
            .createQueryBuilder('k')
            .where('k.provider = :provider', { provider })
            .andWhere('k.status = :status', { status: 'active' })
            .andWhere('k.remaining_quota > 0')
            .andWhere('k.error_count < :threshold', { threshold: ERROR_THRESHOLD })
            .orderBy('k.priority', 'ASC')
            .addOrderBy('k.used_quota', 'ASC')
            .getOne();
        return key || null;
    }
    async markExhausted(keyId) {
        await this.keyRepo.update(keyId, { status: 'exhausted' });
    }
    async markError(keyId) {
        const key = await this.keyRepo.findOne({ where: { id: keyId } });
        if (!key) {
            return;
        }
        const errorCount = key.errorCount + 1;
        const patch = { errorCount };
        if (errorCount >= ERROR_THRESHOLD) {
            patch.status = 'error';
        }
        await this.keyRepo.update(keyId, patch);
    }
    async deductQuota(keyId, amount) {
        const key = await this.keyRepo.findOne({ where: { id: keyId } });
        if (!key) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'API Key 不存在');
        }
        const usedQuota = Number(key.usedQuota) + amount;
        const remainingQuota = Number(key.remainingQuota) - amount;
        const dailyUsedQuota = Number(key.dailyUsedQuota) + amount;
        const monthlyUsedQuota = Number(key.monthlyUsedQuota) + amount;
        const patch = {
            usedQuota,
            remainingQuota,
            dailyUsedQuota,
            monthlyUsedQuota,
            lastUsedAt: new Date(),
        };
        if (remainingQuota <= 0) {
            patch.status = 'exhausted';
        }
        await this.keyRepo.update(keyId, patch);
    }
    async resetDailyQuota() {
        await this.keyRepo
            .createQueryBuilder()
            .update()
            .set({ dailyUsedQuota: 0 })
            .execute();
        this.logger.log('已重置全部 Key 日配额');
    }
    async resetMonthlyQuota() {
        await this.keyRepo
            .createQueryBuilder()
            .update()
            .set({ monthlyUsedQuota: 0 })
            .execute();
        this.logger.log('已重置全部 Key 月配额');
    }
    async checkBalance() {
        await this.keyRepo
            .createQueryBuilder()
            .update()
            .set({ lastCheckAt: new Date() })
            .where('status = :status', { status: 'active' })
            .execute();
    }
    async list(provider) {
        const qb = this.keyRepo.createQueryBuilder('k');
        if (provider) {
            qb.andWhere('k.provider = :provider', { provider });
        }
        qb.orderBy('k.priority', 'ASC').addOrderBy('k.createdAt', 'DESC');
        const keys = await qb.getMany();
        return keys.map((k) => this.maskKey(k));
    }
    async get(id) {
        const key = await this.keyRepo.findOne({ where: { id } });
        if (!key) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'API Key 不存在');
        }
        return this.maskKey(key);
    }
    async create(data) {
        if (!data.apiKey) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, 'apiKey 必填');
        }
        const totalQuota = Number(data.totalQuota || 0);
        const usedQuota = Number(data.usedQuota || 0);
        const entity = this.keyRepo.create({
            provider: data.provider,
            apiKey: this.encryption.encryptAes(data.apiKey),
            alias: data.alias,
            priority: data.priority ?? 0,
            status: 'active',
            modelConfigId: data.modelConfigId,
            totalQuota,
            usedQuota,
            remainingQuota: totalQuota - usedQuota,
            dailyQuota: data.dailyQuota,
            monthlyQuota: data.monthlyQuota,
            dailyUsedQuota: 0,
            monthlyUsedQuota: 0,
            errorCount: 0,
        });
        const saved = await this.keyRepo.save(entity);
        return this.maskKey(saved);
    }
    async update(id, data) {
        const key = await this.keyRepo.findOne({ where: { id } });
        if (!key) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'API Key 不存在');
        }
        const patch = {};
        if (data.provider !== undefined)
            patch.provider = data.provider;
        if (data.alias !== undefined)
            patch.alias = data.alias;
        if (data.priority !== undefined)
            patch.priority = data.priority;
        if (data.status !== undefined)
            patch.status = data.status;
        if (data.modelConfigId !== undefined)
            patch.modelConfigId = data.modelConfigId;
        if (data.apiKey !== undefined)
            patch.apiKey = this.encryption.encryptAes(data.apiKey);
        if (data.totalQuota !== undefined) {
            patch.totalQuota = Number(data.totalQuota);
            patch.remainingQuota = Number(data.totalQuota) - Number(key.usedQuota);
        }
        await this.keyRepo.update(id, patch);
        return this.get(id);
    }
    async delete(id) {
        const key = await this.keyRepo.findOne({ where: { id } });
        if (!key) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'API Key 不存在');
        }
        await this.keyRepo.delete(id);
    }
    async resetErrors(id) {
        const key = await this.keyRepo.findOne({ where: { id } });
        if (!key) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'API Key 不存在');
        }
        await this.keyRepo.update(id, { errorCount: 0, status: 'active' });
    }
    async setLimits(id, dailyQuota, monthlyQuota) {
        const key = await this.keyRepo.findOne({ where: { id } });
        if (!key) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, 'API Key 不存在');
        }
        const patch = {};
        if (dailyQuota !== undefined)
            patch.dailyQuota = dailyQuota;
        if (monthlyQuota !== undefined)
            patch.monthlyQuota = monthlyQuota;
        await this.keyRepo.update(id, patch);
        return this.get(id);
    }
    async getStats() {
        const total = await this.keyRepo.count();
        const active = await this.keyRepo.count({ where: { status: 'active' } });
        const exhausted = await this.keyRepo.count({ where: { status: 'exhausted' } });
        const error = await this.keyRepo.count({ where: { status: 'error' } });
        const disabled = await this.keyRepo.count({ where: { status: 'disabled' } });
        const agg = await this.keyRepo
            .createQueryBuilder('k')
            .select('COALESCE(SUM(k.daily_used_quota),0)', 'dailyConsumed')
            .addSelect('COALESCE(SUM(k.monthly_used_quota),0)', 'monthlyConsumed')
            .getRawOne();
        return {
            total,
            active,
            exhausted,
            error,
            disabled,
            dailyConsumed: Number(agg?.dailyConsumed || 0),
            monthlyConsumed: Number(agg?.monthlyConsumed || 0),
        };
    }
    health() {
        return { status: 'ok', module: 'api-key-pool' };
    }
    maskKey(key) {
        let plain = '';
        try {
            plain = this.encryption.decryptAes(key.apiKey);
        }
        catch {
            plain = key.apiKey;
        }
        if (plain.length > 8) {
            key.apiKey = `${plain.slice(0, 4)}****${plain.slice(-4)}`;
        }
        else {
            key.apiKey = '****';
        }
        return key;
    }
    scheduleDaily(hour, minute, fn) {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
        if (next.getTime() <= now.getTime()) {
            next.setDate(next.getDate() + 1);
        }
        const delay = next.getTime() - now.getTime();
        setTimeout(() => {
            fn();
            setInterval(fn, 24 * 60 * 60 * 1000);
        }, delay);
    }
    scheduleMonthly(fn) {
        this.scheduleDaily(0, 0, () => {
            const today = new Date();
            if (today.getDate() === 1) {
                fn();
            }
        });
    }
};
exports.ApiKeyPoolService = ApiKeyPoolService;
exports.ApiKeyPoolService = ApiKeyPoolService = ApiKeyPoolService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(api_key_pool_entity_1.ApiKeyPoolEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        encryption_service_1.EncryptionService])
], ApiKeyPoolService);
//# sourceMappingURL=api-key-pool.service.js.map