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
exports.AdminDeviceController = exports.DeviceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const device_service_1 = require("./device.service");
const bind_device_dto_1 = require("./dto/bind-device.dto");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
        return xff.split(',')[0].trim();
    }
    return req.ip || '0.0.0.0';
}
let DeviceController = class DeviceController {
    deviceService;
    constructor(deviceService) {
        this.deviceService = deviceService;
    }
    async bind(dto, user, req) {
        const ip = getClientIp(req);
        return this.deviceService.bindDevice(user.userId, dto, ip);
    }
    async list(user) {
        return this.deviceService.listDevices(user.userId);
    }
    async unbind(id, user) {
        await this.deviceService.unbindDevice(user.userId, id);
        return null;
    }
};
exports.DeviceController = DeviceController;
__decorate([
    (0, common_1.Post)('bind'),
    (0, swagger_1.ApiOperation)({ summary: '绑定当前设备（登录后调用）' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bind_device_dto_1.BindDeviceDto, Object, Object]),
    __metadata("design:returntype", Promise)
], DeviceController.prototype, "bind", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '查询当前用户设备列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DeviceController.prototype, "list", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '解绑设备' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], DeviceController.prototype, "unbind", null);
exports.DeviceController = DeviceController = __decorate([
    (0, swagger_1.ApiTags)('设备绑定'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('devices'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [device_service_1.DeviceService])
], DeviceController);
let AdminDeviceController = class AdminDeviceController {
    deviceService;
    constructor(deviceService) {
        this.deviceService = deviceService;
    }
    async listUserDevices(userId) {
        return this.deviceService.adminListDevices(userId);
    }
    async unbindUserDevice(userId, deviceId) {
        void userId;
        await this.deviceService.adminUnbindDevice(deviceId);
        return null;
    }
};
exports.AdminDeviceController = AdminDeviceController;
__decorate([
    (0, common_1.Get)(':userId/devices'),
    (0, swagger_1.ApiOperation)({ summary: '管理端-查询用户设备列表' }),
    __param(0, (0, common_1.Param)('userId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminDeviceController.prototype, "listUserDevices", null);
__decorate([
    (0, common_1.Delete)(':userId/devices/:deviceId'),
    (0, swagger_1.ApiOperation)({ summary: '管理端-远程解绑用户设备' }),
    __param(0, (0, common_1.Param)('userId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('deviceId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], AdminDeviceController.prototype, "unbindUserDevice", null);
exports.AdminDeviceController = AdminDeviceController = __decorate([
    (0, swagger_1.ApiTags)('设备绑定-管理端'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/users'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('super_admin', 'admin'),
    __metadata("design:paramtypes", [device_service_1.DeviceService])
], AdminDeviceController);
//# sourceMappingURL=device.controller.js.map