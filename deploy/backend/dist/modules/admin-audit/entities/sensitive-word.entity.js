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
exports.SensitiveWordEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let SensitiveWordEntity = class SensitiveWordEntity extends base_entity_1.BaseEntity {
    word;
    category;
    level;
    replacement;
};
exports.SensitiveWordEntity = SensitiveWordEntity;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], SensitiveWordEntity.prototype, "word", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['politics', 'porn', 'violence', 'ad', 'other'],
        default: 'other',
    }),
    __metadata("design:type", String)
], SensitiveWordEntity.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['block', 'replace', 'review'],
        default: 'review',
    }),
    __metadata("design:type", String)
], SensitiveWordEntity.prototype, "level", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128, nullable: true }),
    __metadata("design:type", String)
], SensitiveWordEntity.prototype, "replacement", void 0);
exports.SensitiveWordEntity = SensitiveWordEntity = __decorate([
    (0, typeorm_1.Entity)('sensitive_words')
], SensitiveWordEntity);
//# sourceMappingURL=sensitive-word.entity.js.map