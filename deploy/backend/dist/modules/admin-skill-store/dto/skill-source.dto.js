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
exports.SkillSourceQueryDto = exports.CreateSkillSourceDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class CreateSkillSourceDto {
    sourceUrl;
    sourceType;
    skillName;
    skillDesc;
    skillType;
}
exports.CreateSkillSourceDto = CreateSkillSourceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/, { message: '仅支持 GitHub URL' }),
    __metadata("design:type", String)
], CreateSkillSourceDto.prototype, "sourceUrl", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['github']),
    __metadata("design:type", String)
], CreateSkillSourceDto.prototype, "sourceType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateSkillSourceDto.prototype, "skillName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(512),
    __metadata("design:type", String)
], CreateSkillSourceDto.prototype, "skillDesc", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['skill', 'workflow']),
    __metadata("design:type", String)
], CreateSkillSourceDto.prototype, "skillType", void 0);
class SkillSourceQueryDto {
    page = 1;
    pageSize = 20;
    status;
    skillType;
}
exports.SkillSourceQueryDto = SkillSourceQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], SkillSourceQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], SkillSourceQueryDto.prototype, "pageSize", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['pending', 'analyzing', 'analyzed', 'failed']),
    __metadata("design:type", String)
], SkillSourceQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['skill', 'workflow']),
    __metadata("design:type", String)
], SkillSourceQueryDto.prototype, "skillType", void 0);
//# sourceMappingURL=skill-source.dto.js.map