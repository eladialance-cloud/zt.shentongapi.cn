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
exports.RuntimeVersionEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let RuntimeVersionEntity = class RuntimeVersionEntity extends base_entity_1.BaseEntity {
    serviceName;
    version;
    platform;
    downloadUrl;
    sha256;
    changelog;
    isActive;
    forceUpdate;
    minAppVersion;
};
exports.RuntimeVersionEntity = RuntimeVersionEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'service_name', length: 32 }),
    __metadata("design:type", String)
], RuntimeVersionEntity.prototype, "serviceName", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], RuntimeVersionEntity.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 16 }),
    __metadata("design:type", String)
], RuntimeVersionEntity.prototype, "platform", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'download_url', length: 512 }),
    __metadata("design:type", String)
], RuntimeVersionEntity.prototype, "downloadUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'char', length: 64 }),
    __metadata("design:type", String)
], RuntimeVersionEntity.prototype, "sha256", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], RuntimeVersionEntity.prototype, "changelog", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], RuntimeVersionEntity.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'force_update', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], RuntimeVersionEntity.prototype, "forceUpdate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'min_app_version', length: 32, nullable: true }),
    __metadata("design:type", String)
], RuntimeVersionEntity.prototype, "minAppVersion", void 0);
exports.RuntimeVersionEntity = RuntimeVersionEntity = __decorate([
    (0, typeorm_1.Entity)('runtime_versions'),
    (0, typeorm_1.Index)('idx_service_active', ['serviceName', 'isActive'])
], RuntimeVersionEntity);
//# sourceMappingURL=runtime-version.entity.js.map