"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8nModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const n8n_instance_entity_1 = require("./entities/n8n-instance.entity");
const n8n_workflow_entity_1 = require("./entities/n8n-workflow.entity");
const n8n_controller_1 = require("./controllers/n8n.controller");
const n8n_service_1 = require("./services/n8n.service");
const common_module_1 = require("../../common/common.module");
let N8nModule = class N8nModule {
};
exports.N8nModule = N8nModule;
exports.N8nModule = N8nModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([n8n_instance_entity_1.N8nInstanceEntity, n8n_workflow_entity_1.N8nWorkflowEntity]),
            common_module_1.CommonModule,
        ],
        controllers: [n8n_controller_1.N8nController],
        providers: [n8n_service_1.N8nService],
        exports: [n8n_service_1.N8nService],
    })
], N8nModule);
//# sourceMappingURL=n8n.module.js.map