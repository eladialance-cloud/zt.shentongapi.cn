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
exports.SkillInstallLogEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let SkillInstallLogEntity = class SkillInstallLogEntity extends base_entity_1.BaseEntity {
    packageId;
    userId;
    action;
    result;
    errorMessage;
    durationMs;
    detail;
};
exports.SkillInstallLogEntity = SkillInstallLogEntity;
__decorate([
    (0, typeorm_1.Column)({ name: 'package_id', type: 'bigint', transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], SkillInstallLogEntity.prototype, "packageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', nullable: true, transformer: base_entity_1.bigintTransformer }),
    __metadata("design:type", Number)
], SkillInstallLogEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], SkillInstallLogEntity.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32, default: 'success' }),
    __metadata("design:type", String)
], SkillInstallLogEntity.prototype, "result", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_message', length: 1024, nullable: true }),
    __metadata("design:type", String)
], SkillInstallLogEntity.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'duration_ms', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], SkillInstallLogEntity.prototype, "durationMs", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], SkillInstallLogEntity.prototype, "detail", void 0);
exports.SkillInstallLogEntity = SkillInstallLogEntity = __decorate([
    (0, typeorm_1.Entity)('skill_install_logs')
], SkillInstallLogEntity);
//# sourceMappingURL=skill-install-log.entity.js.map