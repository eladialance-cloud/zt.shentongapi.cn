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
exports.InviteCodeQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class InviteCodeQueryDto {
    status;
    page;
    pageSize;
}
exports.InviteCodeQueryDto = InviteCodeQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '状态筛选: active/used/revoked/expired',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['active', 'used', 'revoked', 'expired']),
    __metadata("design:type", String)
], InviteCodeQueryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '页码', required: false, default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)({ message: '页码必须为整数' }),
    (0, class_validator_1.Min)(1, { message: '页码最小为 1' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], InviteCodeQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '每页数量', required: false, default: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)({ message: '每页数量必须为整数' }),
    (0, class_validator_1.Min)(1, { message: '每页数量最小为 1' }),
    (0, class_validator_1.Max)(100, { message: '每页数量最多为 100' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], InviteCodeQueryDto.prototype, "pageSize", void 0);
//# sourceMappingURL=invite-code-query.dto.js.map