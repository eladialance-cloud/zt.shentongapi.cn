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
exports.AdminUserLevelController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_user_service_1 = require("./admin-user.service");
const user_level_config_dto_1 = require("./dto/user-level-config.dto");
let AdminUserLevelController = class AdminUserLevelController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list() {
        return this.service.listUserLevels();
    }
    async update(level, dto) {
        await this.service.updateUserLevelConfig(level, dto);
    }
};
exports.AdminUserLevelController = AdminUserLevelController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '用户等级配置列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminUserLevelController.prototype, "list", null);
__decorate([
    (0, common_1.Put)(':level'),
    (0, swagger_1.ApiOperation)({ summary: '更新等级配置' }),
    __param(0, (0, common_1.Param)('level', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, user_level_config_dto_1.UserLevelConfigDto]),
    __metadata("design:returntype", Promise)
], AdminUserLevelController.prototype, "update", null);
exports.AdminUserLevelController = AdminUserLevelController = __decorate([
    (0, swagger_1.ApiTags)('管理端-用户等级'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/user-levels'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_user_service_1.AdminUserService])
], AdminUserLevelController);
//# sourceMappingURL=admin-user-level.controller.js.map