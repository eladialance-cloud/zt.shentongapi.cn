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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8nController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const n8n_service_1 = require("../services/n8n.service");
const n8n_instance_dto_1 = require("../dto/n8n-instance.dto");
const n8n_workflow_dto_1 = require("../dto/n8n-workflow.dto");
let N8nController = class N8nController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
    listInstances(user) {
        return this.service.listInstances(user.userId);
    }
    createInstance(user, dto) {
        return this.service.createInstance(user.userId, dto);
    }
    getInstance(user, instanceId) {
        return this.service.getInstance(user.userId, instanceId);
    }
    updateInstance(user, instanceId, dto) {
        return this.service.updateInstance(user.userId, instanceId, dto);
    }
    async deleteInstance(user, instanceId) {
        await this.service.deleteInstance(user.userId, instanceId);
        return null;
    }
    testConnection(user, instanceId) {
        return this.service.testConnection(user.userId, instanceId);
    }
    listWorkflows(user, instanceId) {
        return this.service.listWorkflows(user.userId, instanceId);
    }
    getWorkflowDetail(user, instanceId, workflowId) {
        return this.service.getWorkflowDetail(user.userId, instanceId, workflowId);
    }
    triggerWorkflow(user, instanceId, workflowId, dto) {
        return this.service.triggerWorkflow(user.userId, instanceId, workflowId, dto?.inputData);
    }
    activateWorkflow(user, instanceId, workflowId) {
        return this.service.activateWorkflow(user.userId, instanceId, workflowId);
    }
    deactivateWorkflow(user, instanceId, workflowId) {
        return this.service.deactivateWorkflow(user.userId, instanceId, workflowId);
    }
    getExecutionStatus(user, instanceId, executionId) {
        return this.service.getExecutionStatus(user.userId, instanceId, executionId);
    }
    async webhookCallback(instanceId, workflowId, body, signature) {
        return this.service.handleWebhook(instanceId, workflowId, body, signature);
    }
};
exports.N8nController = N8nController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('instances'),
    (0, swagger_1.ApiOperation)({ summary: '获取 N8N 实例列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "listInstances", null);
__decorate([
    (0, common_1.Post)('instances'),
    (0, swagger_1.ApiOperation)({ summary: '创建 N8N 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, n8n_instance_dto_1.CreateN8nInstanceDto]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "createInstance", null);
__decorate([
    (0, common_1.Get)('instances/:instanceId'),
    (0, swagger_1.ApiOperation)({ summary: '获取 N8N 实例详情' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "getInstance", null);
__decorate([
    (0, common_1.Put)('instances/:instanceId'),
    (0, swagger_1.ApiOperation)({ summary: '更新 N8N 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, n8n_instance_dto_1.UpdateN8nInstanceDto]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "updateInstance", null);
__decorate([
    (0, common_1.Delete)('instances/:instanceId'),
    (0, swagger_1.ApiOperation)({ summary: '删除 N8N 实例' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], N8nController.prototype, "deleteInstance", null);
__decorate([
    (0, common_1.Post)('instances/:instanceId/test'),
    (0, swagger_1.ApiOperation)({ summary: '测试 N8N 连接' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "testConnection", null);
__decorate([
    (0, common_1.Get)('instances/:instanceId/workflows'),
    (0, swagger_1.ApiOperation)({ summary: '获取工作流列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "listWorkflows", null);
__decorate([
    (0, common_1.Get)('instances/:instanceId/workflows/:workflowId'),
    (0, swagger_1.ApiOperation)({ summary: '获取工作流详情' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Param)('workflowId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "getWorkflowDetail", null);
__decorate([
    (0, common_1.Post)('instances/:instanceId/workflows/:workflowId/trigger'),
    (0, swagger_1.ApiOperation)({ summary: '触发工作流' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Param)('workflowId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String, n8n_workflow_dto_1.TriggerWorkflowDto]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "triggerWorkflow", null);
__decorate([
    (0, common_1.Post)('instances/:instanceId/workflows/:workflowId/activate'),
    (0, swagger_1.ApiOperation)({ summary: '激活工作流' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Param)('workflowId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "activateWorkflow", null);
__decorate([
    (0, common_1.Post)('instances/:instanceId/workflows/:workflowId/deactivate'),
    (0, swagger_1.ApiOperation)({ summary: '停用工作流' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Param)('workflowId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "deactivateWorkflow", null);
__decorate([
    (0, common_1.Get)('instances/:instanceId/executions/:executionId'),
    (0, swagger_1.ApiOperation)({ summary: '查询执行状态' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Param)('executionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String]),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "getExecutionStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('webhook/:instanceId/:workflowId'),
    (0, swagger_1.ApiOperation)({ summary: 'N8N 工作流执行回调' }),
    __param(0, (0, common_1.Param)('instanceId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('workflowId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-n8n-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Object, String]),
    __metadata("design:returntype", Promise)
], N8nController.prototype, "webhookCallback", null);
exports.N8nController = N8nController = __decorate([
    (0, swagger_1.ApiTags)('N8N'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('n8n'),
    __metadata("design:paramtypes", [n8n_service_1.N8nService])
], N8nController);
//# sourceMappingURL=n8n.controller.js.map