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
exports.UpdateAdminPluginDto = exports.CreateAdminPluginDto = exports.PluginSyncQueryDto = exports.AdminPluginReviewQueryDto = exports.AdminPluginQueryDto = void 0;
const class_validator_1 = require("class-validator");
class AdminPluginQueryDto {
    type;
    status;
    page;
    pageSize;
}
exports.AdminPluginQueryDto = AdminPluginQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminPluginQueryDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminPluginQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminPluginQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminPluginQueryDto.prototype, "pageSize", void 0);
class AdminPluginReviewQueryDto {
    status;
    page;
    pageSize;
}
exports.AdminPluginReviewQueryDto = AdminPluginReviewQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminPluginReviewQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminPluginReviewQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminPluginReviewQueryDto.prototype, "pageSize", void 0);
class PluginSyncQueryDto {
    status;
    page;
    pageSize;
}
exports.PluginSyncQueryDto = PluginSyncQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PluginSyncQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PluginSyncQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PluginSyncQueryDto.prototype, "pageSize", void 0);
class CreateAdminPluginDto {
    name;
    description;
    type;
    version;
    entryPoint;
    sandboxConfig;
    pricingMode;
    pricePerCall;
    pricePerTokenInput;
    pricePerTokenOutput;
}
exports.CreateAdminPluginDto = CreateAdminPluginDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAdminPluginDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAdminPluginDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['tool', 'connector', 'knowledge_base', 'workflow']),
    __metadata("design:type", String)
], CreateAdminPluginDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAdminPluginDto.prototype, "version", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAdminPluginDto.prototype, "entryPoint", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateAdminPluginDto.prototype, "sandboxConfig", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['perCall', 'perToken']),
    __metadata("design:type", String)
], CreateAdminPluginDto.prototype, "pricingMode", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateAdminPluginDto.prototype, "pricePerCall", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateAdminPluginDto.prototype, "pricePerTokenInput", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateAdminPluginDto.prototype, "pricePerTokenOutput", void 0);
class UpdateAdminPluginDto {
    name;
    description;
    type;
    version;
    entryPoint;
    sandboxConfig;
    pricingMode;
    pricePerCall;
    pricePerTokenInput;
    pricePerTokenOutput;
}
exports.UpdateAdminPluginDto = UpdateAdminPluginDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAdminPluginDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAdminPluginDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['tool', 'connector', 'knowledge_base', 'workflow']),
    __metadata("design:type", String)
], UpdateAdminPluginDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAdminPluginDto.prototype, "version", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAdminPluginDto.prototype, "entryPoint", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateAdminPluginDto.prototype, "sandboxConfig", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['perCall', 'perToken']),
    __metadata("design:type", String)
], UpdateAdminPluginDto.prototype, "pricingMode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], UpdateAdminPluginDto.prototype, "pricePerCall", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], UpdateAdminPluginDto.prototype, "pricePerTokenInput", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], UpdateAdminPluginDto.prototype, "pricePerTokenOutput", void 0);
//# sourceMappingURL=plugin.dto.js.map