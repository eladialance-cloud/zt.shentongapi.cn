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
exports.AgentCategoryEntity = void 0;
const typeorm_1 = require("typeorm");
let AgentCategoryEntity = class AgentCategoryEntity {
    id;
    category;
    displayName;
    sort;
    createdAt;
    updatedAt;
};
exports.AgentCategoryEntity = AgentCategoryEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], AgentCategoryEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], AgentCategoryEntity.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'display_name', length: 64 }),
    __metadata("design:type", String)
], AgentCategoryEntity.prototype, "displayName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], AgentCategoryEntity.prototype, "sort", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], AgentCategoryEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], AgentCategoryEntity.prototype, "updatedAt", void 0);
exports.AgentCategoryEntity = AgentCategoryEntity = __decorate([
    (0, typeorm_1.Entity)('agent_categories')
], AgentCategoryEntity);
//# sourceMappingURL=agent-category.entity.js.map