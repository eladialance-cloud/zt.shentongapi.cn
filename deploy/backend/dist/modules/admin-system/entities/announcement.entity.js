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
exports.AnnouncementEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let AnnouncementEntity = class AnnouncementEntity extends base_entity_1.BaseEntity {
    title;
    content;
    type;
    scope;
    targetLevel;
    isActive;
    status;
    publishedAt;
};
exports.AnnouncementEntity = AnnouncementEntity;
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], AnnouncementEntity.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], AnnouncementEntity.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['info', 'warning', 'critical'],
        default: 'info',
    }),
    __metadata("design:type", String)
], AnnouncementEntity.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['all', 'level_specific'],
        default: 'all',
    }),
    __metadata("design:type", String)
], AnnouncementEntity.prototype, "scope", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'target_level', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], AnnouncementEntity.prototype, "targetLevel", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], AnnouncementEntity.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['draft', 'published'],
        default: 'draft',
    }),
    __metadata("design:type", String)
], AnnouncementEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'published_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], AnnouncementEntity.prototype, "publishedAt", void 0);
exports.AnnouncementEntity = AnnouncementEntity = __decorate([
    (0, typeorm_1.Entity)('announcements')
], AnnouncementEntity);
//# sourceMappingURL=announcement.entity.js.map