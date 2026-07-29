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
exports.SkillStoreController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const bigint_parse_pipe_1 = require("../../../common/pipes/bigint-parse.pipe");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const skill_store_service_1 = require("../services/skill-store.service");
const skill_runner_service_1 = require("../services/skill-runner.service");
const execute_dto_1 = require("../dto/execute.dto");
let SkillStoreController = class SkillStoreController {
    storeService;
    runnerService;
    constructor(storeService, runnerService) {
        this.storeService = storeService;
        this.runnerService = runnerService;
    }
    async list(query) {
        return this.storeService.list(query);
    }
    async categories() {
        return this.storeService.categories();
    }
    async detail(id) {
        return this.storeService.detail(id);
    }
    async stats(id) {
        return this.storeService.stats(id);
    }
    async execute(id, dto, user) {
        return this.runnerService.execute(id, dto.input || {}, user.userId);
    }
    health() {
        return { status: 'ok', module: 'skill-store' };
    }
};
exports.SkillStoreController = SkillStoreController;
__decorate([
    (0, common_1.Get)('packages'),
    (0, swagger_1.ApiOperation)({ summary: '技能商店列表（仅 published）' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SkillStoreController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('categories'),
    (0, swagger_1.ApiOperation)({ summary: '技能分类列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SkillStoreController.prototype, "categories", null);
__decorate([
    (0, common_1.Get)('packages/:id'),
    (0, swagger_1.ApiOperation)({ summary: '技能详情' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], SkillStoreController.prototype, "detail", null);
__decorate([
    (0, common_1.Get)('packages/:id/stats'),
    (0, swagger_1.ApiOperation)({ summary: '调用统计' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], SkillStoreController.prototype, "stats", null);
__decorate([
    (0, common_1.Post)('packages/:id/execute'),
    (0, swagger_1.ApiOperation)({ summary: '执行技能' }),
    __param(0, (0, common_1.Param)('id', bigint_parse_pipe_1.BigIntParsePipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, execute_dto_1.ExecuteSkillDto, Object]),
    __metadata("design:returntype", Promise)
], SkillStoreController.prototype, "execute", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SkillStoreController.prototype, "health", null);
exports.SkillStoreController = SkillStoreController = __decorate([
    (0, swagger_1.ApiTags)('技能商店'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('skill-store'),
    __metadata("design:paramtypes", [skill_store_service_1.SkillStoreService,
        skill_runner_service_1.SkillRunnerService])
], SkillStoreController);
//# sourceMappingURL=skill-store.controller.js.map