import { Module } from '@nestjs/common';
import { McpController } from './controllers/mcp.controller';
import { McpService } from './services/mcp.service';

@Module({
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
