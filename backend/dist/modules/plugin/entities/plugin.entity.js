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
exports.PluginEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let PluginEntity = class PluginEntity extends base_entity_1.BaseEntity {
    name;
    description;
    version;
    mcpServerUrl;
    config;
    isOfficial;
    isActive;
};
exports.PluginEntity = PluginEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], PluginEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], PluginEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], PluginEntity.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'mcp_server_url', length: 512, nullable: true }),
    __metadata("design:type", String)
], PluginEntity.prototype, "mcpServerUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], PluginEntity.prototype, "config", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_official', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], PluginEntity.prototype, "isOfficial", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], PluginEntity.prototype, "isActive", void 0);
exports.PluginEntity = PluginEntity = __decorate([
    (0, typeorm_1.Entity)('plugins')
], PluginEntity);
//# sourceMappingURL=plugin.entity.js.map