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
exports.WorkflowEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let WorkflowEntity = class WorkflowEntity extends base_entity_1.BaseEntity {
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
    reviewStatus;
    rejectReason;
    executionCount;
    creatorName;
};
exports.WorkflowEntity = WorkflowEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 1024, nullable: true }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'engine_type', length: 16, default: 'n8n' }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "engineType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'n8n_workflow_id', length: 64, nullable: true }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "n8nWorkflowId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'coze_workflow_id', length: 64, nullable: true }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "cozeWorkflowId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 32, default: 'other' }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'input_schema', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], WorkflowEntity.prototype, "inputSchema", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'output_schema', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], WorkflowEntity.prototype, "outputSchema", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'price_per_execution', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], WorkflowEntity.prototype, "pricePerExecution", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], WorkflowEntity.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'review_status',
        length: 32,
        default: 'pending_review',
    }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "reviewStatus", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reject_reason', length: 512, nullable: true }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "rejectReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'execution_count', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], WorkflowEntity.prototype, "executionCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'creator_name', length: 64, nullable: true }),
    __metadata("design:type", String)
], WorkflowEntity.prototype, "creatorName", void 0);
exports.WorkflowEntity = WorkflowEntity = __decorate([
    (0, typeorm_1.Entity)('workflows')
], WorkflowEntity);
//# sourceMappingURL=workflow.entity.js.map