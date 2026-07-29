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
exports.HermesSkillEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let HermesSkillEntity = class HermesSkillEntity extends base_entity_1.BaseEntity {
    name;
    description;
    author;
    pricePerMinute;
    installCount;
    icon;
    version;
    isActive;
};
exports.HermesSkillEntity = HermesSkillEntity;
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], HermesSkillEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], HermesSkillEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, nullable: true }),
    __metadata("design:type", String)
], HermesSkillEntity.prototype, "author", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'price_per_minute', type: 'int', default: 0, comment: '积分/分钟，0=免费' }),
    __metadata("design:type", Number)
], HermesSkillEntity.prototype, "pricePerMinute", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'install_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], HermesSkillEntity.prototype, "installCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], HermesSkillEntity.prototype, "icon", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64, default: '1.0.0' }),
    __metadata("design:type", String)
], HermesSkillEntity.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], HermesSkillEntity.prototype, "isActive", void 0);
exports.HermesSkillEntity = HermesSkillEntity = __decorate([
    (0, typeorm_1.Entity)('hermes_skills')
], HermesSkillEntity);
//# sourceMappingURL=hermes-skill.entity.js.map