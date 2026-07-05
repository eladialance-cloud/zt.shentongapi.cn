import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentService } from '../services/agent.service';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Agent智能体')
@ApiBearerAuth()
@Controller('agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.agentService.health();
  }
}
