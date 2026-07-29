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
exports.AdminSystemService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const system_config_entity_1 = require("./entities/system-config.entity");
const announcement_entity_1 = require("./entities/announcement.entity");
const tenant_entity_1 = require("./entities/tenant.entity");
const DEFAULT_SECTION_CONFIG = {
    cache: {
        l1Ttl: 60,
        l2Ttl: 300,
        l3Ttl: 3600,
    },
    rate_limit: {
        dailyCallLimitByLevel: { 1: 100, 2: 500, 3: 2000, 4: 10000, 5: 50000 },
        concurrencyLimit: 10,
        monthlyCreditsLimitByLevel: {
            1: 10000,
            2: 50000,
            3: 200000,
            4: 1000000,
            5: 5000000,
        },
    },
    notification: {
        smtp: {
            host: '',
            port: 465,
            username: '',
            from: '',
            enabled: false,
        },
        sms: {
            provider: '',
            accessKeyId: '',
            signName: '',
            enabled: false,
        },
        push: {
            appId: '',
            enabled: false,
        },
    },
    payment: {
        wechat: {
            appId: '',
            mchId: '',
            apiV3Key: '',
            serialNo: '',
            privateKeyPath: '',
            publicKeyPath: '',
            notifyUrl: '',
            callbackIps: '',
            enabled: false,
        },
        alipay: {
            appId: '',
            privateKey: '',
            publicKey: '',
            notifyUrl: '',
            enabled: false,
        },
        stripe: {
            secretKey: '',
            webhookSecret: '',
            enabled: false,
        },
    },
};
let AdminSystemService = class AdminSystemService {
    configRepo;
    announcementRepo;
    tenantRepo;
    constructor(configRepo, announcementRepo, tenantRepo) {
        this.configRepo = configRepo;
        this.announcementRepo = announcementRepo;
        this.tenantRepo = tenantRepo;
    }
    async getSystemConfig(section) {
        const row = await this.configRepo.findOne({ where: { section } });
        if (!row) {
            return { ...(DEFAULT_SECTION_CONFIG[section] || {}) };
        }
        return { ...(DEFAULT_SECTION_CONFIG[section] || {}), ...row.configValue };
    }
    async updateSystemConfig(dto) {
        const existing = await this.configRepo.findOne({
            where: { section: dto.section },
        });
        const base = existing
            ? { ...existing.configValue }
            : { ...(DEFAULT_SECTION_CONFIG[dto.section] || {}) };
        const merged = { ...base, ...dto.config };
        if (existing) {
            existing.configValue = merged;
            await this.configRepo.save(existing);
        }
        else {
            const created = this.configRepo.create({
                section: dto.section,
                configValue: merged,
            });
            await this.configRepo.save(created);
        }
    }
    async clearCache(dto) {
        void dto;
    }
    async listTenants(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const [rows, total] = await this.tenantRepo
            .createQueryBuilder('t')
            .orderBy('t.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();
        return {
            list: rows.map((r) => this.toTenant(r)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async createTenant(dto) {
        const entity = this.tenantRepo.create({
            name: dto.name,
            quota: {
                users: dto.quota.users,
                calls: dto.quota.calls,
                storage: dto.quota.storage,
            },
            status: 'active',
        });
        const saved = await this.tenantRepo.save(entity);
        return this.toTenant(saved);
    }
    async updateTenant(id, dto) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) {
            throw new common_1.NotFoundException(`租户 ${id} 不存在`);
        }
        if (dto.name !== undefined)
            tenant.name = dto.name;
        if (dto.quota !== undefined) {
            tenant.quota = {
                users: dto.quota.users,
                calls: dto.quota.calls,
                storage: dto.quota.storage,
            };
        }
        await this.tenantRepo.save(tenant);
    }
    async suspendTenant(id) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) {
            throw new common_1.NotFoundException(`租户 ${id} 不存在`);
        }
        tenant.status = tenant.status === 'active' ? 'suspended' : 'active';
        await this.tenantRepo.save(tenant);
    }
    async listAnnouncements(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.announcementRepo.createQueryBuilder('a');
        if (query.status) {
            qb.andWhere('a.status = :status', { status: query.status });
        }
        qb.orderBy('a.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [rows, total] = await qb.getManyAndCount();
        return {
            list: rows.map((r) => this.toAnnouncement(r)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async createAnnouncement(dto) {
        const entity = this.announcementRepo.create({
            title: dto.title,
            content: dto.content,
            type: dto.type,
            scope: dto.scope,
            targetLevel: dto.targetLevel,
            isActive: dto.isActive,
            status: 'draft',
        });
        const saved = await this.announcementRepo.save(entity);
        return this.toAnnouncement(saved);
    }
    async updateAnnouncement(id, dto) {
        const announcement = await this.announcementRepo.findOne({ where: { id } });
        if (!announcement) {
            throw new common_1.NotFoundException(`公告 ${id} 不存在`);
        }
        if (dto.title !== undefined)
            announcement.title = dto.title;
        if (dto.content !== undefined)
            announcement.content = dto.content;
        if (dto.type !== undefined)
            announcement.type = dto.type;
        if (dto.scope !== undefined)
            announcement.scope = dto.scope;
        if (dto.targetLevel !== undefined)
            announcement.targetLevel = dto.targetLevel;
        if (dto.isActive !== undefined)
            announcement.isActive = dto.isActive;
        await this.announcementRepo.save(announcement);
    }
    async publishAnnouncement(id) {
        const announcement = await this.announcementRepo.findOne({ where: { id } });
        if (!announcement) {
            throw new common_1.NotFoundException(`公告 ${id} 不存在`);
        }
        announcement.status = 'published';
        announcement.publishedAt = new Date();
        await this.announcementRepo.save(announcement);
    }
    async unpublishAnnouncement(id) {
        const announcement = await this.announcementRepo.findOne({ where: { id } });
        if (!announcement) {
            throw new common_1.NotFoundException(`公告 ${id} 不存在`);
        }
        announcement.status = 'draft';
        await this.announcementRepo.save(announcement);
    }
    async deleteAnnouncement(id) {
        const announcement = await this.announcementRepo.findOne({ where: { id } });
        if (!announcement) {
            throw new common_1.NotFoundException(`公告 ${id} 不存在`);
        }
        await this.announcementRepo.remove(announcement);
    }
    toTenant(r) {
        return {
            id: r.id,
            name: r.name,
            quota: r.quota,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        };
    }
    toAnnouncement(r) {
        return {
            id: r.id,
            title: r.title,
            content: r.content,
            type: r.type,
            scope: r.scope,
            targetLevel: r.targetLevel,
            isActive: r.isActive,
            status: r.status,
            publishedAt: r.publishedAt,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        };
    }
};
exports.AdminSystemService = AdminSystemService;
exports.AdminSystemService = AdminSystemService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(system_config_entity_1.SystemConfigEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(announcement_entity_1.AnnouncementEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(tenant_entity_1.TenantEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], AdminSystemService);
//# sourceMappingURL=admin-system.service.js.map