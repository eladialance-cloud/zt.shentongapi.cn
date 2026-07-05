import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { databaseConfig } from './config/database';
import { jwtConfig } from './config/jwt.config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { HmacVerifyMiddleware } from './common/middleware/hmac-verify.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { AgentModule } from './modules/agent/agent.module';
import { ChatModule } from './modules/chat/chat.module';
import { KnowledgeBaseModule } from './modules/knowledge/knowledge-base.module';
import { ModelModule } from './modules/model/model.module';
import { PaymentModule } from './modules/payment/payment.module';
import { CreditsModule } from './modules/credits/credits.module';
import { PluginModule } from './modules/plugin/plugin.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { FileModule } from './modules/file/file.module';
import { StorageModule } from './modules/storage/storage.module';
import { RagModule } from './modules/rag/rag.module';
import { McpModule } from './modules/mcp/mcp.module';
import { N8nModule } from './modules/n8n/n8n.module';
import { OpcModule } from './modules/opc/opc.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { SystemModule } from './modules/system/system.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { DeviceModule } from './modules/device/device.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { SyncModule } from './modules/sync/sync.module';
import { ApiKeyPoolModule } from './modules/api-key-pool/api-key-pool.module';
import { VersionModule } from './modules/version/version.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminRoleModule } from './modules/admin-role/admin-role.module';
import { AdminLogModule } from './modules/admin-log/admin-log.module';
import { AdminUserModule } from './modules/admin-user/admin-user.module';
import { AdminAgentModule } from './modules/admin-agent/admin-agent.module';
import { AdminWorkflowModule } from './modules/admin-workflow/admin-workflow.module';
import { AdminPluginModule } from './modules/admin-plugin/admin-plugin.module';
import { AdminModelModule } from './modules/admin-model/admin-model.module';
import { AdminFinanceModule } from './modules/admin-finance/admin-finance.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminSystemModule } from './modules/admin-system/admin-system.module';
import { OperationLogInterceptor } from './modules/admin-log/operation-log.interceptor';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.production'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 60),
        },
      ],
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: jwtConfig,
    }),
    CommonModule,
    AuthModule,
    UserModule,
    AgentModule,
    ChatModule,
    KnowledgeBaseModule,
    ModelModule,
    PaymentModule,
    CreditsModule,
    PluginModule,
    WorkflowModule,
    FileModule,
    StorageModule,
    RagModule,
    McpModule,
    N8nModule,
    OpcModule,
    StatisticsModule,
    SystemModule,
    TenantModule,
    DeviceModule,
    ReconciliationModule,
    SyncModule,
    ApiKeyPoolModule,
    VersionModule,
    AdminAuthModule,
    AdminRoleModule,
    AdminLogModule,
    AdminUserModule,
    AdminAgentModule,
    AdminWorkflowModule,
    AdminPluginModule,
    AdminModelModule,
    AdminFinanceModule,
    AdminAuditModule,
    AdminSystemModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: OperationLogInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * 全局注册 HMAC 验签中间件（在 JwtAuthGuard 之前执行）
   * 数据合同真源：Task 32 - 数据安全设计
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HmacVerifyMiddleware).forRoutes('*');
  }
}
