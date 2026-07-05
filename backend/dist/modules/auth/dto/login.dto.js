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
exports.LoginDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class LoginDto {
    account;
    password;
    deviceFingerprint;
    deviceName;
    deviceType;
}
exports.LoginDto = LoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '账号(用户名或邮箱)', example: 'shentong' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '账号不能为空' }),
    __metadata("design:type", String)
], LoginDto.prototype, "account", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '密码', example: 'Pass1234' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: '密码不能为空' }),
    (0, class_validator_1.MinLength)(6, { message: '密码至少6位' }),
    __metadata("design:type", String)
], LoginDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '设备指纹（SHA-256，64 字符 hex）', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(64, 64, { message: '设备指纹必须为 64 字符的 SHA-256 哈希' }),
    __metadata("design:type", String)
], LoginDto.prototype, "deviceFingerprint", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '设备名称', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginDto.prototype, "deviceName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '设备类型 (win32/darwin/linux)', required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['win32', 'darwin', 'linux']),
    __metadata("design:type", String)
], LoginDto.prototype, "deviceType", void 0);
//# sourceMappingURL=login.dto.js.map