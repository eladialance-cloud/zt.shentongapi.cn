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
exports.BatchCreateSensitiveWordDto = exports.BatchSensitiveWordItemDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class BatchSensitiveWordItemDto {
    word;
    category;
    level;
}
exports.BatchSensitiveWordItemDto = BatchSensitiveWordItemDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], BatchSensitiveWordItemDto.prototype, "word", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['politics', 'porn', 'violence', 'ad', 'other']),
    __metadata("design:type", String)
], BatchSensitiveWordItemDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['block', 'replace', 'review']),
    __metadata("design:type", String)
], BatchSensitiveWordItemDto.prototype, "level", void 0);
class BatchCreateSensitiveWordDto {
    words;
}
exports.BatchCreateSensitiveWordDto = BatchCreateSensitiveWordDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BatchSensitiveWordItemDto),
    __metadata("design:type", Array)
], BatchCreateSensitiveWordDto.prototype, "words", void 0);
//# sourceMappingURL=batch-create-sensitive-word.dto.js.map