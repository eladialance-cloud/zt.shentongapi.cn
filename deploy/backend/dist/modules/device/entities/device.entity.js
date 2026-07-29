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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceEntity = void 0;
const typeorm_1 = require("typeorm");
let DeviceEntity = class DeviceEntity {
    id;
    userId;
    deviceFingerprint;
    deviceName;
    deviceType;
    lastLoginAt;
    lastLoginIp;
    status;
    createdAt;
    updatedAt;
};
exports.DeviceEntity = DeviceEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', unsigned: true }),
    __metadata("design:type", Number)
], DeviceEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', unsigned: true }),
    __metadata("design:type", Number)
], DeviceEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'device_fingerprint', type: 'varchar', length: 64 }),
    __metadata("design:type", String)
], DeviceEntity.prototype, "deviceFingerprint", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'device_name', type: 'varchar', length: 128 }),
    __metadata("design:type", String)
], DeviceEntity.prototype, "deviceName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'device_type', type: 'varchar', length: 32 }),
    __metadata("design:type", String)
], DeviceEntity.prototype, "deviceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_login_at', type: 'datetime' }),
    __metadata("design:type", Date)
], DeviceEntity.prototype, "lastLoginAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_login_ip', type: 'varchar', length: 64 }),
    __metadata("design:type", String)
], DeviceEntity.prototype, "lastLoginIp", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'status', type: 'varchar', length: 16, default: 'active' }),
    __metadata("design:type", String)
], DeviceEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], DeviceEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], DeviceEntity.prototype, "updatedAt", void 0);
exports.DeviceEntity = DeviceEntity = __decorate([
    (0, typeorm_1.Entity)('user_devices')
], DeviceEntity);
//# sourceMappingURL=device.entity.js.map