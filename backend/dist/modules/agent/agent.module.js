"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const agent_entity_1 = require("./entities/agent.entity");
const agent_call_log_entity_1 = require("./entities/agent-call-log.entity");
const agent_favorite_entity_1 = require("./entities/agent-favorite.entity");
const agent_rating_entity_1 = require("./entities/agent-rating.entity");
const agent_review_entity_1 = require("./entities/agent-review.entity");
const agent_version_entity_1 = require("./entities/agent-version.entity");
const agent_controller_1 = require("./controllers/agent.controller");
const agent_service_1 = require("./services/agent.service");
let AgentModule = class AgentModule {
};
exports.AgentModule = AgentModule;
exports.AgentModule = AgentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                agent_entity_1.AgentEntity,
                agent_call_log_entity_1.AgentCallLogEntity,
                agent_favorite_entity_1.AgentFavoriteEntity,
                agent_rating_entity_1.AgentRatingEntity,
                agent_review_entity_1.AgentReviewEntity,
                agent_version_entity_1.AgentVersionEntity,
            ]),
        ],
        controllers: [agent_controller_1.AgentController],
        providers: [agent_service_1.AgentService],
        exports: [agent_service_1.AgentService],
    })
], AgentModule);
//# sourceMappingURL=agent.module.js.map