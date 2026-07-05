"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpcModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const opc_agent_repo_entity_1 = require("./entities/opc-agent-repo.entity");
const opc_task_entity_1 = require("./entities/opc-task.entity");
const opc_team_member_entity_1 = require("./entities/opc-team-member.entity");
const opc_team_entity_1 = require("./entities/opc-team.entity");
const opc_controller_1 = require("./controllers/opc.controller");
const opc_service_1 = require("./services/opc.service");
let OpcModule = class OpcModule {
};
exports.OpcModule = OpcModule;
exports.OpcModule = OpcModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                opc_agent_repo_entity_1.OpcAgentRepoEntity,
                opc_task_entity_1.OpcTaskEntity,
                opc_team_member_entity_1.OpcTeamMemberEntity,
                opc_team_entity_1.OpcTeamEntity,
            ]),
        ],
        controllers: [opc_controller_1.OpcController],
        providers: [opc_service_1.OpcService],
        exports: [opc_service_1.OpcService],
    })
], OpcModule);
//# sourceMappingURL=opc.module.js.map