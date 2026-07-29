"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminWorkflowModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const workflow_entity_1 = require("./entities/workflow.entity");
const admin_workflow_controller_1 = require("./admin-workflow.controller");
const admin_workflow_service_1 = require("./admin-workflow.service");
let AdminWorkflowModule = class AdminWorkflowModule {
};
exports.AdminWorkflowModule = AdminWorkflowModule;
exports.AdminWorkflowModule = AdminWorkflowModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([workflow_entity_1.WorkflowEntity]),
            admin_auth_module_1.AdminAuthModule,
        ],
        controllers: [admin_workflow_controller_1.AdminWorkflowController],
        providers: [admin_workflow_service_1.AdminWorkflowService],
        exports: [admin_workflow_service_1.AdminWorkflowService],
    })
], AdminWorkflowModule);
//# sourceMappingURL=admin-workflow.module.js.map