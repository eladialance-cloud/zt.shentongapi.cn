"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminSkillStoreService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const fs = __importStar(require("fs/promises"));
const skill_source_entity_1 = require("../skill-store/entities/skill-source.entity");
const skill_package_entity_1 = require("../skill-store/entities/skill-package.entity");
const skill_install_log_entity_1 = require("../skill-store/entities/skill-install-log.entity");
const skill_analyzer_service_1 = require("../skill-store/services/skill-analyzer.service");
const skill_runner_service_1 = require("../skill-store/services/skill-runner.service");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
let AdminSkillStoreService = class AdminSkillStoreService {
    sourceRepo;
    packageRepo;
    installLogRepo;
    analyzerService;
    skillRunnerService;
    constructor(sourceRepo, packageRepo, installLogRepo, analyzerService, skillRunnerService) {
        this.sourceRepo = sourceRepo;
        this.packageRepo = packageRepo;
        this.installLogRepo = installLogRepo;
        this.analyzerService = analyzerService;
        this.skillRunnerService = skillRunnerService;
    }
    async createSource(dto) {
        const existing = await this.sourceRepo.findOne({ where: { sourceUrl: dto.sourceUrl } });
        if (existing) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '该来源URL已存在');
        }
        const source = new skill_source_entity_1.SkillSourceEntity();
        source.sourceUrl = dto.sourceUrl;
        source.sourceType = dto.sourceType;
        source.skillName = dto.skillName;
        source.skillDesc = dto.skillDesc;
        source.skillType = dto.skillType;
        source.status = 'pending';
        return this.sourceRepo.save(source);
    }
    async listSources(query) {
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const qb = this.sourceRepo.createQueryBuilder('s');
        if (query.status) {
            qb.andWhere('s.status = :status', { status: query.status });
        }
        if (query.skillType) {
            qb.andWhere('s.skill_type = :skillType', { skillType: query.skillType });
        }
        qb.orderBy('s.created_at', 'DESC')
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
    async listPackages(query) {
        const page = Number(query.page) || 1;
        const pageSize = Number(query.pageSize) || 20;
        const qb = this.packageRepo.createQueryBuilder('p');
        if (query.status) {
            qb.andWhere('p.status = :status', { status: query.status });
        }
        if (query.skillType) {
            qb.andWhere('p.skill_type = :skillType', { skillType: query.skillType });
        }
        if (query.category) {
            qb.andWhere('p.category = :category', { category: query.category });
        }
        if (query.reviewStatus) {
            qb.andWhere('p.review_status = :reviewStatus', {
                reviewStatus: query.reviewStatus,
            });
        }
        qb.orderBy('p.created_at', 'DESC')
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
    async removeSource(id) {
        const source = await this.sourceRepo.findOne({ where: { id } });
        if (!source) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能源 ${id} 不存在`);
        }
        if (source.packageId) {
            await this.installLogRepo.delete({ packageId: source.packageId });
            const pkg = await this.packageRepo.findOne({ where: { id: source.packageId } });
            if (pkg?.installPath) {
                try {
                    await fs.rm(pkg.installPath, { recursive: true, force: true });
                }
                catch (e) {
                    console.warn(`删除 installPath 失败: ${e.message}`);
                }
            }
            await this.packageRepo.delete(source.packageId);
        }
        await this.sourceRepo.delete(id);
    }
    async packageDetail(id) {
        const pkg = await this.packageRepo.findOne({ where: { id } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
        }
        return pkg;
    }
    async updatePackage(id, dto) {
        const pkg = await this.packageRepo.findOne({ where: { id } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
        }
        Object.assign(pkg, dto);
        await this.packageRepo.save(pkg);
    }
    async submitReview(id) {
        const pkg = await this.packageRepo.findOne({ where: { id } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
        }
        if (pkg.status !== 'draft') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '仅草稿状态可提交审核');
        }
        pkg.status = 'reviewing';
        await this.packageRepo.save(pkg);
    }
    async approve(id) {
        const pkg = await this.packageRepo.findOne({ where: { id } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
        }
        pkg.reviewStatus = 'approved';
        pkg.status = 'approved';
        await this.packageRepo.save(pkg);
    }
    async reject(id, reason) {
        const pkg = await this.packageRepo.findOne({ where: { id } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
        }
        pkg.reviewStatus = 'rejected';
        pkg.reviewNote = reason;
        await this.packageRepo.save(pkg);
    }
    async publish(id) {
        const pkg = await this.packageRepo.findOne({ where: { id } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
        }
        if (pkg.reviewStatus !== 'approved') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '仅审核通过的技能包可上架');
        }
        pkg.status = 'published';
        await this.packageRepo.save(pkg);
    }
    async unpublish(id) {
        const pkg = await this.packageRepo.findOne({ where: { id } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
        }
        if (pkg.status !== 'published') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '仅已上架的技能包可下架');
        }
        pkg.status = 'unpublished';
        await this.packageRepo.save(pkg);
    }
    async removePackage(id) {
        const pkg = await this.packageRepo.findOne({ where: { id } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
        }
        await this.installLogRepo.delete({ packageId: id });
        const linkedSources = await this.sourceRepo.find({ where: { packageId: id } });
        for (const source of linkedSources) {
            source.packageId = undefined;
            source.status = 'analyzed';
            await this.sourceRepo.save(source);
        }
        if (pkg.installPath) {
            try {
                await fs.rm(pkg.installPath, { recursive: true, force: true });
            }
            catch (e) {
                console.warn(`删除 installPath 失败: ${e.message}`);
            }
        }
        await this.packageRepo.delete(id);
    }
    async triggerAnalyze(id) {
        const source = await this.sourceRepo.findOne({ where: { id } });
        if (!source) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能源 ${id} 不存在`);
        }
        if (source.status !== 'pending' && source.status !== 'failed') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, `技能源当前状态为 ${source.status}，不可重新解析`);
        }
        source.status = 'analyzing';
        source.errorMessage = undefined;
        await this.sourceRepo.save(source);
        this.analyzerService.analyze(id).catch((e) => {
            console.error(`[AdminSkillStore] 异步分析失败: ${e.message}`);
        });
        return { status: 'analyzing', message: '解析已启动' };
    }
    async healthCheck(id) {
        return this.skillRunnerService.healthCheck(id);
    }
};
exports.AdminSkillStoreService = AdminSkillStoreService;
exports.AdminSkillStoreService = AdminSkillStoreService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(skill_source_entity_1.SkillSourceEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(skill_package_entity_1.SkillPackageEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(skill_install_log_entity_1.SkillInstallLogEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        skill_analyzer_service_1.SkillAnalyzerService,
        skill_runner_service_1.SkillRunnerService])
], AdminSkillStoreService);
//# sourceMappingURL=admin-skill-store.service.js.map