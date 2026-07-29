import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpServerEntity } from './entities/mcp-server.entity';
import { McpToolRegistryEntity } from '../admin-mcp/entities/mcp-tool-registry.entity';
import { McpController } from './controllers/mcp.controller';
import { McpService } from './services/mcp.service';

@Module({
  imports: [TypeOrmModule.forFeature([McpServerEntity, McpToolRegistryEntity])],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
