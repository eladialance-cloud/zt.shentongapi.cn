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
exports.GenerateInviteCodesDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class GenerateInviteCodesDto {
    count;
    expireDays;
}
exports.GenerateInviteCodesDto = GenerateInviteCodesDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '生成数量 1-100', example: 10, default: 10 }),
    (0, class_validator_1.IsInt)({ message: '数量必须为整数' }),
    (0, class_validator_1.Min)(1, { message: '数量最少为 1' }),
    (0, class_validator_1.Max)(100, { message: '数量最多为 100' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], GenerateInviteCodesDto.prototype, "count", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '有效期天数 1-90',
        example: 30,
        required: false,
        default: 30,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)({ message: '有效期天数必须为整数' }),
    (0, class_validator_1.Min)(1, { message: '有效期天数最少为 1' }),
    (0, class_validator_1.Max)(90, { message: '有效期天数最多为 90' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], GenerateInviteCodesDto.prototype, "expireDays", void 0);
//# sourceMappingURL=generate-invite-codes.dto.js.map