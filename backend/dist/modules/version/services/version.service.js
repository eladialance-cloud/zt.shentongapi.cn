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
exports.VersionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const client_version_entity_1 = require("../entities/client-version.entity");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let VersionService = class VersionService {
    versionRepo;
    constructor(versionRepo) {
        this.versionRepo = versionRepo;
    }
    async checkUpdate(platform, currentVersion) {
        const latest = await this.getLatest(platform);
        if (!latest) {
            return {
                hasUpdate: false,
                latestVersion: null,
                forceUpdate: false,
                grayscaleHit: false,
                downloadUrl: null,
                changelog: null,
            };
        }
        const hasUpdate = this.compareVersion(currentVersion, latest.version) < 0;
        const grayscaleHit = this.isGrayscaleHit(latest.grayscalePercent);
        return {
            hasUpdate,
            latestVersion: latest.version,
            forceUpdate: latest.forceUpdate && hasUpdate,
            grayscaleHit,
            downloadUrl: latest.downloadUrl,
            changelog: latest.changelog || null,
        };
    }
    async getLatest(platform) {
        return this.versionRepo
            .createQueryBuilder('v')
            .where('v.platform = :platform', { platform })
            .andWhere('v.is_active = :active', { active: true })
            .orderBy('v.published_at', 'DESC')
            .addOrderBy('v.createdAt', 'DESC')
            .getOne();
    }
    async getStats(versionId) {
        const version = await this.versionRepo.findOne({ where: { id: versionId } });
        if (!version) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '版本不存在');
        }
        return {
            versionId,
            installCount: 0,
            activeCount: 0,
        };
    }
    async list(platform) {
        const qb = this.versionRepo.createQueryBuilder('v');
        if (platform) {
            qb.andWhere('v.platform = :platform', { platform });
        }
        qb.orderBy('v.publishedAt', 'DESC').addOrderBy('v.createdAt', 'DESC');
        return qb.getMany();
    }
    async get(id) {
        const version = await this.versionRepo.findOne({ where: { id } });
        if (!version) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '版本不存在');
        }
        return version;
    }
    async create(data) {
        const entity = this.versionRepo.create({
            version: data.version,
            platform: data.platform,
            downloadUrl: data.downloadUrl,
            changelog: data.changelog,
            forceUpdate: data.forceUpdate ?? false,
            grayscalePercent: data.grayscalePercent ?? 100,
            publishedAt: data.publishedAt || new Date(),
            isActive: data.isActive ?? true,
        });
        return this.versionRepo.save(entity);
    }
    async update(id, data) {
        const version = await this.versionRepo.findOne({ where: { id } });
        if (!version) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '版本不存在');
        }
        const patch = {};
        if (data.version !== undefined)
            patch.version = data.version;
        if (data.platform !== undefined)
            patch.platform = data.platform;
        if (data.downloadUrl !== undefined)
            patch.downloadUrl = data.downloadUrl;
        if (data.changelog !== undefined)
            patch.changelog = data.changelog;
        if (data.forceUpdate !== undefined)
            patch.forceUpdate = data.forceUpdate;
        if (data.grayscalePercent !== undefined)
            patch.grayscalePercent = data.grayscalePercent;
        if (data.publishedAt !== undefined)
            patch.publishedAt = data.publishedAt;
        if (data.isActive !== undefined)
            patch.isActive = data.isActive;
        await this.versionRepo.update(id, patch);
        return this.get(id);
    }
    async delete(id) {
        const version = await this.versionRepo.findOne({ where: { id } });
        if (!version) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '版本不存在');
        }
        await this.versionRepo.delete(id);
    }
    health() {
        return { status: 'ok', module: 'version' };
    }
    compareVersion(a, b) {
        const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
        const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na < nb)
                return -1;
            if (na > nb)
                return 1;
        }
        return 0;
    }
    isGrayscaleHit(grayscalePercent) {
        if (grayscalePercent >= 100)
            return true;
        if (grayscalePercent <= 0)
            return false;
        return Math.floor(Math.random() * 100) < grayscalePercent;
    }
};
exports.VersionService = VersionService;
exports.VersionService = VersionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(client_version_entity_1.ClientVersionEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], VersionService);
//# sourceMappingURL=version.service.js.map