import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommonModule } from "../../common/common.module";
import { McpServerEntity } from "./entities/mcp-server.entity";
import { McpCatalogEntity } from "../admin-mcp/entities/mcp-catalog.entity";
import { McpController } from "./controllers/mcp.controller";
import { McpCatalogController } from "./controllers/mcp-catalog.controller";
import { McpService } from "./services/mcp.service";
import { N8nMcpBridgeService } from "./services/n8n-mcp-bridge.service";
import { RagMcpBridgeService } from "./services/rag-mcp-bridge.service";
import { N8nModule } from "../n8n/n8n.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([McpServerEntity, McpCatalogEntity]),
    CommonModule,
    N8nModule,
  ],
  controllers: [McpController, McpCatalogController],
  providers: [McpService, N8nMcpBridgeService, RagMcpBridgeService],
  exports: [McpService, N8nMcpBridgeService, RagMcpBridgeService],
})
export class McpModule {}