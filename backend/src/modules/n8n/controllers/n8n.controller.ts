import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { N8nService } from '../services/n8n.service';

@ApiTags('N8N')
@ApiBearerAuth()
@Controller('n8n')
export class N8nController {
  constructor(private readonly service: N8nService) {}

  @Public()
  @Get('health')
  health() {
    return this.service.health();
  }
}
