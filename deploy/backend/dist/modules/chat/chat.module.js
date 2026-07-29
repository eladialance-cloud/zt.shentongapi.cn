"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const chat_group_entity_1 = require("./entities/chat-group.entity");
const chat_message_entity_1 = require("./entities/chat-message.entity");
const chat_session_entity_1 = require("./entities/chat-session.entity");
const agent_entity_1 = require("../agent/entities/agent.entity");
const chat_controller_1 = require("./controllers/chat.controller");
const chat_service_1 = require("./services/chat.service");
const llm_client_service_1 = require("./services/llm-client.service");
const credits_module_1 = require("../credits/credits.module");
const api_key_pool_module_1 = require("../api-key-pool/api-key-pool.module");
const common_module_1 = require("../../common/common.module");
const mcp_module_1 = require("../mcp/mcp.module");
const openclaw_module_1 = require("../openclaw/openclaw.module");
let ChatModule = class ChatModule {
};
exports.ChatModule = ChatModule;
exports.ChatModule = ChatModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                chat_group_entity_1.ChatGroupEntity,
                chat_message_entity_1.ChatMessageEntity,
                chat_session_entity_1.ChatSessionEntity,
                agent_entity_1.AgentEntity,
            ]),
            credits_module_1.CreditsModule,
            api_key_pool_module_1.ApiKeyPoolModule,
            common_module_1.CommonModule,
            mcp_module_1.McpModule,
            openclaw_module_1.OpenClawModule,
        ],
        controllers: [chat_controller_1.ChatController],
        providers: [chat_service_1.ChatService, llm_client_service_1.LlmClientService],
        exports: [chat_service_1.ChatService],
    })
], ChatModule);
//# sourceMappingURL=chat.module.js.map