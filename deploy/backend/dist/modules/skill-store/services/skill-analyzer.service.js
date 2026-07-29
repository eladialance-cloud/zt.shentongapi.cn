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
var SkillAnalyzerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillAnalyzerService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const fs = __importStar(require("fs/promises"));
const skill_source_entity_1 = require("../entities/skill-source.entity");
const skill_package_entity_1 = require("../entities/skill-package.entity");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
const github_adapter_1 = require("../adapters/github-adapter");
const manifest_generator_1 = require("../adapters/manifest-generator");
let SkillAnalyzerService = SkillAnalyzerService_1 = class SkillAnalyzerService {
    sourceRepo;
    packageRepo;
    githubAdapter;
    manifestGenerator;
    logger = new common_1.Logger(SkillAnalyzerService_1.name);
    constructor(sourceRepo, packageRepo, githubAdapter, manifestGenerator) {
        this.sourceRepo = sourceRepo;
        this.packageRepo = packageRepo;
        this.githubAdapter = githubAdapter;
        this.manifestGenerator = manifestGenerator;
    }
    async analyze(sourceId) {
        const source = await this.sourceRepo.findOne({ where: { id: sourceId } });
        if (!source) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, `技能源 ${sourceId} 不存在`);
        }
        const adapter = this.getAdapter(source.sourceType);
        source.status = 'analyzing';
        await this.sourceRepo.save(source);
        let localPath;
        try {
            localPath = await adapter.fetch(source.sourceUrl);
            const analysis = await adapter.analyze(localPath);
            const skillType = this.determineSkillType(analysis);
            const manifest = await adapter.generateManifest(localPath, analysis);
            manifest.displayName = source.skillName;
            manifest.description = source.skillDesc;
            manifest.skillType = skillType;
            manifest.sourceUrl = source.sourceUrl;
            if (manifest.dependencies) {
                try {
                    await adapter.installDependencies(localPath, manifest.dependencies);
                }
                catch (e) {
                    this.logger.warn(`依赖安装失败（已忽略）: ${e.message}`);
                }
            }
            const pkg = this.buildPackage(manifest);
            if (source.packageId) {
                const existingPkg = await this.packageRepo.findOne({ where: { id: source.packageId } });
                if (existingPkg) {
                    Object.assign(existingPkg, {
                        name: pkg.name,
                        displayName: pkg.displayName,
                        description: pkg.description,
                        skillType: pkg.skillType,
                        runtimeType: pkg.runtimeType,
                        category: pkg.category,
                        sourceUrl: pkg.sourceUrl,
                        installPath: pkg.installPath,
                        skillMdPath: pkg.skillMdPath,
                        entryPoint: pkg.entryPoint,
                        inputSchema: pkg.inputSchema,
                        outputSchema: pkg.outputSchema,
                        dependencies: pkg.dependencies,
                        triggerKeywords: pkg.triggerKeywords,
                        examples: pkg.examples,
                        uiConfig: pkg.uiConfig,
                        opcAgentConfig: pkg.opcAgentConfig,
                    });
                    const savedPkg = await this.packageRepo.save(existingPkg);
                    source.status = 'analyzed';
                    source.autoDetectedType = manifest.runtimeType;
                    source.analyzeResult = analysis;
                    await this.sourceRepo.save(source);
                    return savedPkg;
                }
            }
            const savedPkg = await this.packageRepo.save(pkg);
            source.status = 'analyzed';
            source.packageId = savedPkg.id;
            source.autoDetectedType = manifest.runtimeType;
            source.analyzeResult = analysis;
            await this.sourceRepo.save(source);
            return savedPkg;
        }
        catch (e) {
            source.status = 'failed';
            source.errorMessage = (e.message || '分析失败').slice(0, 1024);
            await this.sourceRepo.save(source);
            if (localPath) {
                try {
                    await fs.rm(localPath, { recursive: true, force: true });
                }
                catch (rmErr) {
                    this.logger.warn(`清理克隆目录失败: ${rmErr.message}`);
                }
            }
            throw e;
        }
    }
    determineSkillType(analysis) {
        if (analysis.hasWorkflowDefinition ||
            analysis.hasMultiStepProcess ||
            analysis.hasCompleteEntryPoint) {
            return 'workflow';
        }
        return 'skill';
    }
    getAdapter(sourceType) {
        if (sourceType === 'github') {
            return this.githubAdapter;
        }
        business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '暂不支持该来源类型');
    }
    buildPackage(manifest) {
        const pkg = new skill_package_entity_1.SkillPackageEntity();
        pkg.name = manifest.name;
        pkg.displayName = manifest.displayName;
        pkg.description = manifest.description;
        pkg.skillType = manifest.skillType;
        pkg.runtimeType = manifest.runtimeType;
        pkg.category = manifest.category;
        pkg.sourceUrl = manifest.sourceUrl;
        pkg.installPath = manifest.installPath;
        pkg.skillMdPath = manifest.skillMdPath;
        pkg.entryPoint = manifest.entryPoint;
        pkg.inputSchema = manifest.inputSchema;
        pkg.outputSchema = manifest.outputSchema;
        pkg.dependencies = manifest.dependencies;
        pkg.triggerKeywords = manifest.triggerKeywords;
        pkg.examples = manifest.examples;
        pkg.uiConfig = manifest.uiConfig;
        pkg.opcAgentConfig = manifest.opcAgentConfig;
        pkg.status = 'draft';
        pkg.reviewStatus = 'pending';
        return pkg;
    }
};
exports.SkillAnalyzerService = SkillAnalyzerService;
exports.SkillAnalyzerService = SkillAnalyzerService = SkillAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(skill_source_entity_1.SkillSourceEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(skill_package_entity_1.SkillPackageEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        github_adapter_1.GitHubAdapter,
        manifest_generator_1.ManifestGenerator])
], SkillAnalyzerService);
//# sourceMappingURL=skill-analyzer.service.js.map