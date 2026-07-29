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
var SkillRunnerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillRunnerService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const skill_package_entity_1 = require("../entities/skill-package.entity");
const skill_install_log_entity_1 = require("../entities/skill-install-log.entity");
const chat_session_entity_1 = require("../../chat/entities/chat-session.entity");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
const credits_service_1 = require("../../credits/services/credits.service");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
let SkillRunnerService = SkillRunnerService_1 = class SkillRunnerService {
    packageRepo;
    logRepo;
    sessionRepo;
    creditsService;
    logger = new common_1.Logger(SkillRunnerService_1.name);
    constructor(packageRepo, logRepo, sessionRepo, creditsService) {
        this.packageRepo = packageRepo;
        this.logRepo = logRepo;
        this.sessionRepo = sessionRepo;
        this.creditsService = creditsService;
    }
    async execute(packageId, input, userId) {
        if (!userId) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.UNAUTHORIZED, '执行技能需要登录');
        }
        const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
        if (!pkg || pkg.status !== 'published') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '技能不存在或未上架');
        }
        const estimatedCost = 5;
        let frozenTxnId = null;
        try {
            const freezeTxn = await this.creditsService.freezeCredits(userId, estimatedCost, 'model_call', `skill_${packageId}`);
            frozenTxnId = freezeTxn.id;
        }
        catch {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.FORBIDDEN, '积分余额不足，请充值');
        }
        const startTime = Date.now();
        let result = 'success';
        let errorMessage;
        try {
            let output;
            switch (pkg.runtimeType) {
                case 'markdown-only':
                case 'openclaw-skill':
                    output = await this.executeAsOpcSkill(pkg, input, userId);
                    break;
                case 'python-cli':
                    output = await this.executeAsCli(pkg, input, 'python');
                    break;
                case 'node-cli':
                    output = await this.executeAsCli(pkg, input, 'node');
                    break;
                case 'docker':
                case 'rest-api':
                    business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '暂不支持该运行类型');
                    break;
                default:
                    business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, `不支持的运行类型: ${pkg.runtimeType}`);
            }
            await this.packageRepo.increment({ id: packageId }, 'callCount', 1);
            if (frozenTxnId) {
                try {
                    await this.creditsService.settleCredits(userId, frozenTxnId, estimatedCost);
                }
                catch (err) {
                    this.logger.error(`技能执行积分结算失败: ${err.message}`);
                }
            }
            return output;
        }
        catch (e) {
            result = 'failed';
            errorMessage = (e.message || '执行失败').slice(0, 1024);
            if (frozenTxnId) {
                try {
                    await this.creditsService.refundCredits(userId, frozenTxnId);
                }
                catch (refundErr) {
                    this.logger.error(`技能执行积分退款失败: ${refundErr.message}`);
                }
            }
            throw e;
        }
        finally {
            await this.writeLog(packageId, userId, 'execute', result, Date.now() - startTime, errorMessage);
        }
    }
    async executeAsOpcSkill(pkg, input, userId) {
        const skillMdPath = pkg.skillMdPath ||
            (pkg.installPath ? path.join(pkg.installPath, 'SKILL.md') : null);
        if (skillMdPath) {
            try {
                await fs.readFile(skillMdPath, 'utf-8');
            }
            catch (e) {
                this.logger.warn(`读取 SKILL.md 失败: ${e.message}`);
            }
        }
        const session = new chat_session_entity_1.ChatSessionEntity();
        session.title = `[技能] ${pkg.displayName}`;
        session.modelId = 'default';
        session.agentId = `skill:${pkg.name}`;
        session.userId = userId;
        session.groupId = 0;
        const saved = await this.sessionRepo.save(session);
        return {
            sessionId: saved.id,
            skillName: pkg.name,
            skillType: pkg.skillType,
            input,
            message: pkg.skillType === 'workflow'
                ? '已启动完整流程，请在此对话中直接使用'
                : '已加载技能，可以在对话中调用',
        };
    }
    async executeAsCli(pkg, input, runtime) {
        if (!pkg.entryPoint) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '技能未配置入口文件');
        }
        if (!pkg.installPath) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '技能未安装');
        }
        const cmd = runtime === 'python' ? 'python3' : 'node';
        const args = [pkg.entryPoint, JSON.stringify(input)];
        try {
            const { stdout } = await execFileAsync(cmd, args, {
                timeout: 30000,
                maxBuffer: 10 * 1024 * 1024,
                cwd: pkg.installPath,
            });
            return {
                skillName: pkg.name,
                skillType: pkg.skillType,
                message: '执行完成',
                output: stdout,
            };
        }
        catch (e) {
            const err = e;
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, `技能执行失败: ${err.stderr || err.message}`);
        }
    }
    async healthCheck(packageId) {
        const pkg = await this.packageRepo.findOne({ where: { id: packageId } });
        if (!pkg) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '技能不存在');
        }
        const startTime = Date.now();
        let healthy = false;
        let detail = '';
        try {
            switch (pkg.runtimeType) {
                case 'markdown-only':
                case 'openclaw-skill':
                    if (pkg.skillMdPath) {
                        await fs.access(pkg.skillMdPath);
                        healthy = true;
                        detail = 'SKILL.md 存在';
                    }
                    else {
                        detail = '未配置 skillMdPath';
                    }
                    break;
                case 'python-cli':
                case 'node-cli':
                    if (pkg.entryPoint && pkg.installPath) {
                        await fs.access(path.join(pkg.installPath, pkg.entryPoint));
                        healthy = true;
                        detail = '入口文件存在';
                    }
                    else if (!pkg.entryPoint) {
                        detail = '未配置 entryPoint';
                    }
                    else {
                        detail = '未配置 installPath';
                    }
                    break;
                case 'docker':
                    if (pkg.installPath) {
                        await fs.access(path.join(pkg.installPath, 'Dockerfile'));
                        healthy = true;
                        detail = 'Dockerfile 存在';
                    }
                    else {
                        detail = '未配置 installPath';
                    }
                    break;
                default:
                    detail = `不支持的运行类型: ${pkg.runtimeType}`;
            }
        }
        catch (e) {
            detail = `健康检查失败: ${e.message}`;
        }
        await this.writeLog(packageId, undefined, 'health_check', healthy ? 'success' : 'failed', Date.now() - startTime, healthy ? undefined : detail);
        return { healthy, detail };
    }
    async writeLog(packageId, userId, action, result, durationMs, errorMessage) {
        const log = new skill_install_log_entity_1.SkillInstallLogEntity();
        log.packageId = packageId;
        log.userId = userId;
        log.action = action;
        log.result = result;
        log.durationMs = durationMs;
        if (errorMessage) {
            log.errorMessage = errorMessage.slice(0, 1024);
        }
        await this.logRepo.save(log);
    }
};
exports.SkillRunnerService = SkillRunnerService;
exports.SkillRunnerService = SkillRunnerService = SkillRunnerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(skill_package_entity_1.SkillPackageEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(skill_install_log_entity_1.SkillInstallLogEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(chat_session_entity_1.ChatSessionEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        credits_service_1.CreditsService])
], SkillRunnerService);
//# sourceMappingURL=skill-runner.service.js.map