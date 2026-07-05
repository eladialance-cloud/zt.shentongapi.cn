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
exports.DeviceService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const device_entity_1 = require("./entities/device.entity");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
const MAX_DEVICE_COUNT = 3;
let DeviceService = class DeviceService {
    deviceRepo;
    constructor(deviceRepo) {
        this.deviceRepo = deviceRepo;
    }
    async bindDevice(userId, dto, ip) {
        const existing = await this.findByFingerprint(userId, dto.deviceFingerprint);
        if (existing) {
            existing.lastLoginAt = new Date();
            existing.lastLoginIp = ip;
            return this.deviceRepo.save(existing);
        }
        const count = await this.getUserDeviceCount(userId);
        if (count >= MAX_DEVICE_COUNT) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.DEVICE_LIMIT_EXCEEDED, `已绑定设备数超过限制（最多 ${MAX_DEVICE_COUNT} 台），请先解绑旧设备`);
        }
        const device = this.deviceRepo.create({
            userId,
            deviceFingerprint: dto.deviceFingerprint,
            deviceName: dto.deviceName,
            deviceType: dto.deviceType,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
            status: 'active',
        });
        return this.deviceRepo.save(device);
    }
    async listDevices(userId) {
        return this.deviceRepo.find({
            where: { userId },
            order: { lastLoginAt: 'DESC' },
        });
    }
    async unbindDevice(userId, deviceId) {
        const device = await this.deviceRepo.findOne({ where: { id: deviceId, userId } });
        if (!device) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '设备不存在或无权操作');
        }
        await this.deviceRepo.delete(deviceId);
    }
    async unbindByFingerprint(userId, fingerprint) {
        await this.deviceRepo.delete({ userId, deviceFingerprint: fingerprint });
    }
    async checkDeviceLimit(userId) {
        const count = await this.getUserDeviceCount(userId);
        return count >= MAX_DEVICE_COUNT;
    }
    async getUserDeviceCount(userId) {
        return this.deviceRepo.count({ where: { userId } });
    }
    async findByFingerprint(userId, fingerprint) {
        return this.deviceRepo.findOne({
            where: { userId, deviceFingerprint: fingerprint },
        });
    }
    async updateLoginInfo(deviceId, ip) {
        await this.deviceRepo.update(deviceId, {
            lastLoginAt: new Date(),
            lastLoginIp: ip,
        });
    }
    async adminListDevices(userId) {
        return this.deviceRepo.find({
            where: { userId },
            order: { lastLoginAt: 'DESC' },
        });
    }
    async adminUnbindDevice(deviceId) {
        const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
        if (!device) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '设备不存在');
        }
        await this.deviceRepo.delete(deviceId);
    }
};
exports.DeviceService = DeviceService;
exports.DeviceService = DeviceService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(device_entity_1.DeviceEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], DeviceService);
//# sourceMappingURL=device.service.js.map