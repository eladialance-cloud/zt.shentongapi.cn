import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { McpService } from '../services/mcp.service';

@ApiTags('MCP')
@ApiBearerAuth()
@Controller('mcp')
export class McpController {
  constructor(private readonly service: McpService) {}

  @Public()
  @Get('health')
  health() {
    return this.service.health();
  }
}
