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
exports.SkillStoreService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const skill_package_entity_1 = require("../entities/skill-package.entity");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
let SkillStoreService = class SkillStoreService {
    packageRepo;
    constructor(packageRepo) {
        this.packageRepo = packageRepo;
    }
    async list(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 12));
        const qb = this.packageRepo
            .createQueryBuilder('p')
            .where('p.status = :status', { status: 'published' });
        if (query.category) {
            qb.andWhere('p.category = :category', { category: query.category });
        }
        if (query.skillType) {
            qb.andWhere('p.skill_type = :skillType', { skillType: query.skillType });
        }
        if (query.keyword) {
            const escapedKw = query.keyword.replace(/[%_]/g, '\\$&');
            qb.andWhere('(p.display_name LIKE :kw OR p.description LIKE :kw OR p.name LIKE :kw)', {
                kw: `%${escapedKw}%`,
            });
        }
        qb.orderBy('p.call_count', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [list, total] = await qb.getManyAndCount();
        const safeList = list.map((p) => this.toSafePackage(p));
        return { list: safeList, total, page, pageSize };
    }
    async detail(id) {
        const pkg = await this.packageRepo.findOne({
            where: { id, status: 'published' },
        });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '技能不存在或未上架');
        }
        return this.toSafePackage(pkg);
    }
    async categories() {
        const result = await this.packageRepo
            .createQueryBuilder('p')
            .select('p.category', 'category')
            .addSelect('COUNT(*)', 'count')
            .where('p.status = :status', { status: 'published' })
            .andWhere('p.category IS NOT NULL')
            .groupBy('p.category')
            .getRawMany();
        return result.map((r) => ({ category: r.category, count: Number(r.count) }));
    }
    async stats(id) {
        const pkg = await this.packageRepo.findOne({
            where: { id, status: 'published' },
        });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '技能不存在或未上架');
        }
        return {
            callCount: pkg.callCount,
            avgRating: Number(pkg.avgRating),
            version: pkg.version,
            updatedAt: pkg.updatedAt,
        };
    }
    toSafePackage(pkg) {
        const { installPath, skillMdPath, ...safe } = pkg;
        return safe;
    }
};
exports.SkillStoreService = SkillStoreService;
exports.SkillStoreService = SkillStoreService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(skill_package_entity_1.SkillPackageEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], SkillStoreService);
//# sourceMappingURL=skill-store.service.js.map