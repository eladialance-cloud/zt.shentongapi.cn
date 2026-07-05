"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const throttler_1 = require("@nestjs/throttler");
const jwt_1 = require("@nestjs/jwt");
const core_1 = require("@nestjs/core");
const database_1 = require("./config/database");
const jwt_config_1 = require("./config/jwt.config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const common_module_1 = require("./common/common.module");
const hmac_verify_middleware_1 = require("./common/middleware/hmac-verify.middleware");
const auth_module_1 = require("./modules/auth/auth.module");
const user_module_1 = require("./modules/user/user.module");
const agent_module_1 = require("./modules/agent/agent.module");
const chat_module_1 = require("./modules/chat/chat.module");
const knowledge_base_module_1 = require("./modules/knowledge/knowledge-base.module");
const model_module_1 = require("./modules/model/model.module");
const payment_module_1 = require("./modules/payment/payment.module");
const credits_module_1 = require("./modules/credits/credits.module");
const plugin_module_1 = require("./modules/plugin/plugin.module");
const workflow_module_1 = require("./modules/workflow/workflow.module");
const file_module_1 = require("./modules/file/file.module");
const storage_module_1 = require("./modules/storage/storage.module");
const rag_module_1 = require("./modules/rag/rag.module");
const mcp_module_1 = require("./modules/mcp/mcp.module");
const n8n_module_1 = require("./modules/n8n/n8n.module");
const opc_module_1 = require("./modules/opc/opc.module");
const statistics_module_1 = require("./modules/statistics/statistics.module");
const system_module_1 = require("./modules/system/system.module");
const tenant_module_1 = require("./modules/tenant/tenant.module");
const device_module_1 = require("./modules/device/device.module");
const reconciliation_module_1 = require("./modules/reconciliation/reconciliation.module");
const sync_module_1 = require("./modules/sync/sync.module");
const api_key_pool_module_1 = require("./modules/api-key-pool/api-key-pool.module");
const version_module_1 = require("./modules/version/version.module");
const jwt_auth_guard_1 = require("./common/guards/jwt-auth.guard");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(hmac_verify_middleware_1.HmacVerifyMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env', '.env.production'],
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: database_1.databaseConfig,
            }),
            throttler_1.ThrottlerModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => [
                    {
                        ttl: config.get('THROTTLE_TTL', 60000),
                        limit: config.get('THROTTLE_LIMIT', 60),
                    },
                ],
            }),
            jwt_1.JwtModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: jwt_config_1.jwtConfig,
            }),
            common_module_1.CommonModule,
            auth_module_1.AuthModule,
            user_module_1.UserModule,
            agent_module_1.AgentModule,
            chat_module_1.ChatModule,
            knowledge_base_module_1.KnowledgeBaseModule,
            model_module_1.ModelModule,
            payment_module_1.PaymentModule,
            credits_module_1.CreditsModule,
            plugin_module_1.PluginModule,
            workflow_module_1.WorkflowModule,
            file_module_1.FileModule,
            storage_module_1.StorageModule,
            rag_module_1.RagModule,
            mcp_module_1.McpModule,
            n8n_module_1.N8nModule,
            opc_module_1.OpcModule,
            statistics_module_1.StatisticsModule,
            system_module_1.SystemModule,
            tenant_module_1.TenantModule,
            device_module_1.DeviceModule,
            reconciliation_module_1.ReconciliationModule,
            sync_module_1.SyncModule,
            api_key_pool_module_1.ApiKeyPoolModule,
            version_module_1.VersionModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map