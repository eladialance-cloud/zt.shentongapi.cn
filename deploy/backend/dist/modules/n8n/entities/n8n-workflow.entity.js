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
exports.N8nWorkflowEntity = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../common/entities/base.entity");
let N8nWorkflowEntity = class N8nWorkflowEntity extends base_entity_1.BaseEntity {
    instanceId;
    userId;
    workflowId;
    name;
    active;
    nodes;
    connections;
    tags;
    lastExecutedAt;
    lastExecutionStatus;
};
exports.N8nWorkflowEntity = N8nWorkflowEntity;
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'instance_id', type: 'bigint', unsigned: true }),
    __metadata("design:type", Number)
], N8nWorkflowEntity.prototype, "instanceId", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ name: 'user_id', type: 'bigint', unsigned: true }),
    __metadata("design:type", Number)
], N8nWorkflowEntity.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'workflow_id', length: 64 }),
    __metadata("design:type", String)
], N8nWorkflowEntity.prototype, "workflowId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 128 }),
    __metadata("design:type", String)
], N8nWorkflowEntity.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], N8nWorkflowEntity.prototype, "active", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], N8nWorkflowEntity.prototype, "nodes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Object)
], N8nWorkflowEntity.prototype, "connections", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Array)
], N8nWorkflowEntity.prototype, "tags", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_executed_at', type: 'datetime', nullable: true }),
    __metadata("design:type", Date)
], N8nWorkflowEntity.prototype, "lastExecutedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'last_execution_status',
        length: 32,
        default: 'unknown',
    }),
    __metadata("design:type", String)
], N8nWorkflowEntity.prototype, "lastExecutionStatus", void 0);
exports.N8nWorkflowEntity = N8nWorkflowEntity = __decorate([
    (0, typeorm_1.Entity)('n8n_workflows')
], N8nWorkflowEntity);
//# sourceMappingURL=n8n-workflow.entity.js.map