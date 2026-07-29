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
exports.AdminTenantController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const admin_guard_1 = require("../admin-auth/admin.guard");
const admin_system_service_1 = require("./admin-system.service");
const tenant_query_dto_1 = require("./dto/tenant-query.dto");
const create_tenant_dto_1 = require("./dto/create-tenant.dto");
const update_tenant_dto_1 = require("./dto/update-tenant.dto");
let AdminTenantController = class AdminTenantController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(query) {
        return this.service.listTenants(query);
    }
    async create(dto) {
        return this.service.createTenant(dto);
    }
    async update(id, dto) {
        await this.service.updateTenant(id, dto);
        return null;
    }
    async suspend(id) {
        await this.service.suspendTenant(id);
        return null;
    }
};
exports.AdminTenantController = AdminTenantController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '租户列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tenant_query_dto_1.TenantQueryDto]),
    __metadata("design:returntype", Promise)
], AdminTenantController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '新增租户' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_tenant_dto_1.CreateTenantDto]),
    __metadata("design:returntype", Promise)
], AdminTenantController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '编辑租户' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_tenant_dto_1.UpdateTenantDto]),
    __metadata("design:returntype", Promise)
], AdminTenantController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/suspend'),
    (0, swagger_1.ApiOperation)({ summary: '停用/恢复租户' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminTenantController.prototype, "suspend", null);
exports.AdminTenantController = AdminTenantController = __decorate([
    (0, swagger_1.ApiTags)('管理端-租户'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/tenants'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_system_service_1.AdminSystemService])
], AdminTenantController);
//# sourceMappingURL=admin-tenant.controller.js.map