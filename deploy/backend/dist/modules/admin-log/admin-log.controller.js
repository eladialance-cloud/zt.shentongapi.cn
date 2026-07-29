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
exports.AdminLogController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_log_service_1 = require("./admin-log.service");
const operation_log_query_dto_1 = require("./dto/operation-log-query.dto");
const public_decorator_1 = require("../../common/decorators/public.decorator");
let AdminLogController = class AdminLogController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(query) {
        return this.service.list(query);
    }
};
exports.AdminLogController = AdminLogController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '操作日志查询' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [operation_log_query_dto_1.OperationLogQueryDto]),
    __metadata("design:returntype", Promise)
], AdminLogController.prototype, "list", null);
exports.AdminLogController = AdminLogController = __decorate([
    (0, swagger_1.ApiTags)('管理端-操作日志'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/operation-logs'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_log_service_1.AdminLogService])
], AdminLogController);
//# sourceMappingURL=admin-log.controller.js.map