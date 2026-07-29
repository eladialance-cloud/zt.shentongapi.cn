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
exports.UpdateAdminWorkflowDto = exports.CreateAdminWorkflowDto = exports.AdminWorkflowReviewQueryDto = exports.AdminWorkflowQueryDto = void 0;
const class_validator_1 = require("class-validator");
class AdminWorkflowQueryDto {
    engineType;
    category;
    keyword;
    status;
    page;
    pageSize;
}
exports.AdminWorkflowQueryDto = AdminWorkflowQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminWorkflowQueryDto.prototype, "engineType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminWorkflowQueryDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminWorkflowQueryDto.prototype, "keyword", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminWorkflowQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminWorkflowQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminWorkflowQueryDto.prototype, "pageSize", void 0);
class AdminWorkflowReviewQueryDto {
    status;
    page;
    pageSize;
}
exports.AdminWorkflowReviewQueryDto = AdminWorkflowReviewQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AdminWorkflowReviewQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminWorkflowReviewQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], AdminWorkflowReviewQueryDto.prototype, "pageSize", void 0);
class CreateAdminWorkflowDto {
    name;
    description;
    engineType;
    n8nWorkflowId;
    cozeWorkflowId;
    category;
    inputSchema;
    outputSchema;
    pricePerExecution;
    isActive;
}
exports.CreateAdminWorkflowDto = CreateAdminWorkflowDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAdminWorkflowDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAdminWorkflowDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['n8n', 'coze']),
    __metadata("design:type", String)
], CreateAdminWorkflowDto.prototype, "engineType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAdminWorkflowDto.prototype, "n8nWorkflowId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateAdminWorkflowDto.prototype, "cozeWorkflowId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['automation', 'integration', 'data_processing', 'other']),
    __metadata("design:type", String)
], CreateAdminWorkflowDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateAdminWorkflowDto.prototype, "inputSchema", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateAdminWorkflowDto.prototype, "outputSchema", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateAdminWorkflowDto.prototype, "pricePerExecution", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateAdminWorkflowDto.prototype, "isActive", void 0);
class UpdateAdminWorkflowDto {
    name;
    description;
    engineType;
    n8nWorkflowId;
    cozeWorkflowId;
    category;
    inputSchema;
    outputSchema;
    pricePerExecution;
    isActive;
}
exports.UpdateAdminWorkflowDto = UpdateAdminWorkflowDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAdminWorkflowDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAdminWorkflowDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['n8n', 'coze']),
    __metadata("design:type", String)
], UpdateAdminWorkflowDto.prototype, "engineType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAdminWorkflowDto.prototype, "n8nWorkflowId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateAdminWorkflowDto.prototype, "cozeWorkflowId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['automation', 'integration', 'data_processing', 'other']),
    __metadata("design:type", String)
], UpdateAdminWorkflowDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateAdminWorkflowDto.prototype, "inputSchema", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateAdminWorkflowDto.prototype, "outputSchema", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], UpdateAdminWorkflowDto.prototype, "pricePerExecution", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateAdminWorkflowDto.prototype, "isActive", void 0);
//# sourceMappingURL=workflow.dto.js.map