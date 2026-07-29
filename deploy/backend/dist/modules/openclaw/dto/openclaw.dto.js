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
exports.UpdateConfigDto = exports.RegisterInstanceDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class RegisterInstanceDto {
    agentId;
    openclawAgentId;
    endpoint;
    config;
}
exports.RegisterInstanceDto = RegisterInstanceDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '关联的 Agent ID' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RegisterInstanceDto.prototype, "agentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'OpenClaw 侧 agentId' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterInstanceDto.prototype, "openclawAgentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'OpenClaw API 地址', default: 'http://localhost:8080' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterInstanceDto.prototype, "endpoint", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '配置（SOUL.md/工具策略/MCP 配置等）' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], RegisterInstanceDto.prototype, "config", void 0);
class UpdateConfigDto {
    endpoint;
    config;
}
exports.UpdateConfigDto = UpdateConfigDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'OpenClaw API 地址' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateConfigDto.prototype, "endpoint", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '配置 JSON' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateConfigDto.prototype, "config", void 0);
//# sourceMappingURL=openclaw.dto.js.map