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
exports.SkillPackageEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let SkillPackageEntity = class SkillPackageEntity extends base_entity_1.BaseEntity {
    name;
    displayName;
    description;
    skillType;
    runtimeType;
    category;
    sourceUrl;
    installPath;
    skillMdPath;
    entryPoint;
    inputSchema;
    outputSchema;
    dependencies;
    triggerKeywords;
    examples;
    uiConfig;
    opcAgentConfig;
    status;
    reviewStatus;
    reviewNote;
    isOfficial;
    callCount;
    avgRating;
    version;
};
exports.SkillPackageEntity = SkillPackageEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'display_name', length: 512 }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "displayName", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512 }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'skill_type', length: 32, default: 'skill' }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "skillType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'runtime_type', length: 32 }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "runtimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32, nullable: true }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_url', length: 512 }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "sourceUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'install_path', length: 512, nullable: true }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "installPath", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'skill_md_path', length: 512, nullable: true }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "skillMdPath", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'entry_point', length: 256, nullable: true }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "entryPoint", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'input_schema', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], SkillPackageEntity.prototype, "inputSchema", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'output_schema', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], SkillPackageEntity.prototype, "outputSchema", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], SkillPackageEntity.prototype, "dependencies", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'trigger_keywords', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], SkillPackageEntity.prototype, "triggerKeywords", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Array)
], SkillPackageEntity.prototype, "examples", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ui_config', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], SkillPackageEntity.prototype, "uiConfig", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'opc_agent_config', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], SkillPackageEntity.prototype, "opcAgentConfig", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: ['draft', 'reviewing', 'approved', 'published', 'unpublished', 'failed'],
        default: 'draft',
    }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'review_status',
        type: 'enum',
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "reviewStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'review_note', length: 512, nullable: true }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "reviewNote", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_official', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], SkillPackageEntity.prototype, "isOfficial", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'call_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], SkillPackageEntity.prototype, "callCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'avg_rating', type: 'decimal', precision: 3, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], SkillPackageEntity.prototype, "avgRating", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32, default: '1.0.0' }),
    __metadata("design:type", String)
], SkillPackageEntity.prototype, "version", void 0);
exports.SkillPackageEntity = SkillPackageEntity = __decorate([
    (0, typeorm_1.Entity)('skill_packages')
], SkillPackageEntity);
//# sourceMappingURL=skill-package.entity.js.map