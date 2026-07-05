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
exports.ModelEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let ModelEntity = class ModelEntity extends base_entity_1.BaseEntity {
    provider;
    modelId;
    name;
    description;
    contextWindow;
    maxTokens;
    supportsVision;
    supportsFunctions;
    pricePer1kInput;
    pricePer1kOutput;
    isActive;
};
exports.ModelEntity = ModelEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], ModelEntity.prototype, "provider", void 0);
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ name: 'model_id', length: 64 }),
    __metadata("design:type", String)
], ModelEntity.prototype, "modelId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], ModelEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 512, nullable: true }),
    __metadata("design:type", String)
], ModelEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'context_window', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], ModelEntity.prototype, "contextWindow", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'max_tokens', type: 'int', nullable: true }),
    __metadata("design:type", Number)
], ModelEntity.prototype, "maxTokens", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'supports_vision', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], ModelEntity.prototype, "supportsVision", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'supports_functions', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], ModelEntity.prototype, "supportsFunctions", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'price_per_1k_input',
        type: 'decimal',
        precision: 10,
        scale: 4,
        nullable: true,
    }),
    __metadata("design:type", Number)
], ModelEntity.prototype, "pricePer1kInput", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'price_per_1k_output',
        type: 'decimal',
        precision: 10,
        scale: 4,
        nullable: true,
    }),
    __metadata("design:type", Number)
], ModelEntity.prototype, "pricePer1kOutput", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], ModelEntity.prototype, "isActive", void 0);
exports.ModelEntity = ModelEntity = __decorate([
    (0, typeorm_1.Entity)('models')
], ModelEntity);
//# sourceMappingURL=model.entity.js.map