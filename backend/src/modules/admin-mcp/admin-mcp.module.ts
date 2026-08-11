import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpServerConfigEntity } from './entities/mcp-server-config.entity';
import { McpToolRegistryEntity } from './entities/mcp-tool-registry.entity';
import { McpResourceRegistryEntity } from './entities/mcp-resource-registry.entity';
import { McpCallLogEntity } from './entities/mcp-call-log.entity';
import { McpCatalogEntity } from './entities/mcp-catalog.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminMcpController } from './admin-mcp.controller';
import { AdminMcpService } from './admin-mcp.service';
import { AdminMcpCatalogController } from './admin-mcp-catalog.controller';
import { AdminMcpCatalogService } from './admin-mcp-catalog.service';
import { AdminClassifyModule } from '../admin-classify/admin-classify.module';

/**
 * MCP 全局管理模块
 *
 * 提供管理端对 MCP Server、工具、资源、调用日志的统一管理能力。
 * 导入 AdminAuthModule 以复用 AdminGuard。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      McpServerConfigEntity,
      McpToolRegistryEntity,
      McpResourceRegistryEntity,
      McpCallLogEntity,
      McpCatalogEntity,
    ]),
    AdminAuthModule,
    AdminClassifyModule,
  ],
  controllers: [AdminMcpController, AdminMcpCatalogController],
  providers: [AdminMcpService, AdminMcpCatalogService],
  exports: [AdminMcpService],
})
export class AdminMcpModule {}
