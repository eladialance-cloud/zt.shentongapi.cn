"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const openclaw_instance_entity_1 = require("./entities/openclaw-instance.entity");
const agent_entity_1 = require("../agent/entities/agent.entity");
const openclaw_controller_1 = require("./controllers/openclaw.controller");
const openclaw_service_1 = require("./services/openclaw.service");
const credits_module_1 = require("../credits/credits.module");
let OpenClawModule = class OpenClawModule {
};
exports.OpenClawModule = OpenClawModule;
exports.OpenClawModule = OpenClawModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([openclaw_instance_entity_1.OpenClawInstanceEntity, agent_entity_1.AgentEntity]),
            credits_module_1.CreditsModule,
        ],
        controllers: [openclaw_controller_1.OpenClawController],
        providers: [openclaw_service_1.OpenClawService],
        exports: [openclaw_service_1.OpenClawService],
    })
], OpenClawModule);
//# sourceMappingURL=openclaw.module.js.map