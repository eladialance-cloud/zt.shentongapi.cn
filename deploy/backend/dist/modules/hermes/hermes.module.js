"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HermesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const hermes_instance_entity_1 = require("./entities/hermes-instance.entity");
const hermes_call_log_entity_1 = require("./entities/hermes-call-log.entity");
const hermes_skill_entity_1 = require("./entities/hermes-skill.entity");
const hermes_controller_1 = require("./controllers/hermes.controller");
const hermes_service_1 = require("./services/hermes.service");
const credits_module_1 = require("../credits/credits.module");
const mcp_module_1 = require("../mcp/mcp.module");
const n8n_module_1 = require("../n8n/n8n.module");
const openclaw_module_1 = require("../openclaw/openclaw.module");
let HermesModule = class HermesModule {
};
exports.HermesModule = HermesModule;
exports.HermesModule = HermesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                hermes_instance_entity_1.HermesInstanceEntity,
                hermes_call_log_entity_1.HermesCallLogEntity,
                hermes_skill_entity_1.HermesSkillEntity,
            ]),
            credits_module_1.CreditsModule,
            mcp_module_1.McpModule,
            n8n_module_1.N8nModule,
            openclaw_module_1.OpenClawModule,
        ],
        controllers: [hermes_controller_1.HermesController],
        providers: [hermes_service_1.HermesService],
        exports: [hermes_service_1.HermesService],
    })
], HermesModule);
//# sourceMappingURL=hermes.module.js.map