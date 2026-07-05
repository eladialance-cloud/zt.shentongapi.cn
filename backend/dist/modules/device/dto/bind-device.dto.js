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
exports.BindDeviceDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class BindDeviceDto {
    deviceFingerprint;
    deviceName;
    deviceType;
}
exports.BindDeviceDto = BindDeviceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '设备指纹（SHA-256，64 字符 hex）', example: 'a1b2...c3d4' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(64, 64, { message: '设备指纹必须为 64 字符的 SHA-256 哈希' }),
    __metadata("design:type", String)
], BindDeviceDto.prototype, "deviceFingerprint", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '设备名称', example: 'DESKTOP-win32' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128, { message: '设备名称最多 128 字符' }),
    __metadata("design:type", String)
], BindDeviceDto.prototype, "deviceName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '设备类型', enum: ['win32', 'darwin', 'linux'] }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['win32', 'darwin', 'linux'], { message: '设备类型必须为 win32/darwin/linux' }),
    __metadata("design:type", String)
], BindDeviceDto.prototype, "deviceType", void 0);
//# sourceMappingURL=bind-device.dto.js.map