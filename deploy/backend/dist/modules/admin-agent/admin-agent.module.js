"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAgentModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const agent_entity_1 = require("../agent/entities/agent.entity");
const agent_review_entity_1 = require("../agent/entities/agent-review.entity");
const user_entity_1 = require("../user/entities/user.entity");
const agent_category_entity_1 = require("./entities/agent-category.entity");
const agent_import_task_entity_1 = require("./entities/agent-import-task.entity");
const admin_auth_module_1 = require("../admin-auth/admin-auth.module");
const admin_agent_controller_1 = require("./admin-agent.controller");
const admin_agent_service_1 = require("./admin-agent.service");
let AdminAgentModule = class AdminAgentModule {
};
exports.AdminAgentModule = AdminAgentModule;
exports.AdminAgentModule = AdminAgentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                agent_entity_1.AgentEntity,
                agent_review_entity_1.AgentReviewEntity,
                user_entity_1.UserEntity,
                agent_category_entity_1.AgentCategoryEntity,
                agent_import_task_entity_1.AgentImportTaskEntity,
            ]),
            admin_auth_module_1.AdminAuthModule,
        ],
        controllers: [admin_agent_controller_1.AdminAgentController],
        providers: [admin_agent_service_1.AdminAgentService],
        exports: [admin_agent_service_1.AdminAgentService],
    })
], AdminAgentModule);
//# sourceMappingURL=admin-agent.module.js.map