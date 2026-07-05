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
exports.WorkflowController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const workflow_service_1 = require("../services/workflow.service");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
let WorkflowController = class WorkflowController {
    workflowService;
    constructor(workflowService) {
        this.workflowService = workflowService;
    }
    health() {
        return this.workflowService.health();
    }
};
exports.WorkflowController = WorkflowController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WorkflowController.prototype, "health", null);
exports.WorkflowController = WorkflowController = __decorate([
    (0, swagger_1.ApiTags)('工作流'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workflows'),
    __metadata("design:paramtypes", [workflow_service_1.WorkflowService])
], WorkflowController);
//# sourceMappingURL=workflow.controller.js.map