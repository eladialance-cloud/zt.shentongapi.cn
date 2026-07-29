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
exports.SystemConfigEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let SystemConfigEntity = class SystemConfigEntity extends base_entity_1.BaseEntity {
    section;
    configValue;
    description;
};
exports.SystemConfigEntity = SystemConfigEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'section', length: 32 }),
    __metadata("design:type", String)
], SystemConfigEntity.prototype, "section", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'config_value', type: 'json' }),
    __metadata("design:type", Object)
], SystemConfigEntity.prototype, "configValue", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 256, nullable: true }),
    __metadata("design:type", String)
], SystemConfigEntity.prototype, "description", void 0);
exports.SystemConfigEntity = SystemConfigEntity = __decorate([
    (0, typeorm_1.Entity)('system_config')
], SystemConfigEntity);
//# sourceMappingURL=system-config.entity.js.map