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
exports.AdminSensitiveWordController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_audit_service_1 = require("./admin-audit.service");
const sensitive_word_query_dto_1 = require("./dto/sensitive-word-query.dto");
const create_sensitive_word_dto_1 = require("./dto/create-sensitive-word.dto");
const batch_create_sensitive_word_dto_1 = require("./dto/batch-create-sensitive-word.dto");
let AdminSensitiveWordController = class AdminSensitiveWordController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(query) {
        return this.service.listSensitiveWords(query);
    }
    async create(dto) {
        return this.service.createSensitiveWord(dto);
    }
    async batchCreate(dto) {
        return this.service.batchCreateSensitiveWords(dto);
    }
    async remove(id) {
        await this.service.deleteSensitiveWord(id);
        return null;
    }
};
exports.AdminSensitiveWordController = AdminSensitiveWordController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '敏感词列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [sensitive_word_query_dto_1.SensitiveWordQueryDto]),
    __metadata("design:returntype", Promise)
], AdminSensitiveWordController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '新增敏感词' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_sensitive_word_dto_1.CreateSensitiveWordDto]),
    __metadata("design:returntype", Promise)
], AdminSensitiveWordController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('batch'),
    (0, swagger_1.ApiOperation)({ summary: '批量导入敏感词' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [batch_create_sensitive_word_dto_1.BatchCreateSensitiveWordDto]),
    __metadata("design:returntype", Promise)
], AdminSensitiveWordController.prototype, "batchCreate", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '删除敏感词' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminSensitiveWordController.prototype, "remove", null);
exports.AdminSensitiveWordController = AdminSensitiveWordController = __decorate([
    (0, swagger_1.ApiTags)('管理端-敏感词'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/sensitive-words'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_audit_service_1.AdminAuditService])
], AdminSensitiveWordController);
//# sourceMappingURL=admin-sensitive-word.controller.js.map