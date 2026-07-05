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
exports.ClientVersionEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let ClientVersionEntity = class ClientVersionEntity extends base_entity_1.BaseEntity {
    version;
    platform;
    downloadUrl;
    changelog;
    forceUpdate;
    grayscalePercent;
    publishedAt;
    isActive;
};
exports.ClientVersionEntity = ClientVersionEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ length: 32 }),
    __metadata("design:type", String)
], ClientVersionEntity.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ length: 16 }),
    __metadata("design:type", String)
], ClientVersionEntity.prototype, "platform", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'download_url', length: 512 }),
    __metadata("design:type", String)
], ClientVersionEntity.prototype, "downloadUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], ClientVersionEntity.prototype, "changelog", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'force_update', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], ClientVersionEntity.prototype, "forceUpdate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'grayscale_percent', type: 'int', default: 100 }),
    __metadata("design:type", Number)
], ClientVersionEntity.prototype, "grayscalePercent", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'published_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], ClientVersionEntity.prototype, "publishedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], ClientVersionEntity.prototype, "isActive", void 0);
exports.ClientVersionEntity = ClientVersionEntity = __decorate([
    (0, typeorm_1.Entity)('client_versions')
], ClientVersionEntity);
//# sourceMappingURL=client-version.entity.js.map