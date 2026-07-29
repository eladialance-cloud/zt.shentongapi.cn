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
exports.SkillSourceEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let SkillSourceEntity = class SkillSourceEntity extends base_entity_1.BaseEntity {
    sourceUrl;
    sourceType;
    skillName;
    skillDesc;
    skillType;
    autoDetectedType;
    status;
    analyzeResult;
    errorMessage;
    packageId;
};
exports.SkillSourceEntity = SkillSourceEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'source_url', length: 512 }),
    __metadata("design:type", String)
], SkillSourceEntity.prototype, "sourceUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_type', length: 32, default: 'github' }),
    __metadata("design:type", String)
], SkillSourceEntity.prototype, "sourceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'skill_name', length: 64 }),
    __metadata("design:type", String)
], SkillSourceEntity.prototype, "skillName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'skill_desc', length: 512 }),
    __metadata("design:type", String)
], SkillSourceEntity.prototype, "skillDesc", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'skill_type', length: 32, default: 'skill' }),
    __metadata("design:type", String)
], SkillSourceEntity.prototype, "skillType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'auto_detected_type', length: 32, nullable: true }),
    __metadata("design:type", String)
], SkillSourceEntity.prototype, "autoDetectedType", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: ['pending', 'analyzing', 'analyzed', 'failed'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], SkillSourceEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'analyze_result', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], SkillSourceEntity.prototype, "analyzeResult", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_message', length: 1024, nullable: true }),
    __metadata("design:type", String)
], SkillSourceEntity.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'package_id', type: 'bigint', nullable: true, transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], SkillSourceEntity.prototype, "packageId", void 0);
exports.SkillSourceEntity = SkillSourceEntity = __decorate([
    (0, typeorm_1.Entity)('skill_sources')
], SkillSourceEntity);
//# sourceMappingURL=skill-source.entity.js.map