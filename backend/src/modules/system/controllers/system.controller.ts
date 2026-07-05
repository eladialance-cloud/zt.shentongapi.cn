import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { SystemService } from '../services/system.service';

@ApiTags('系统')
@ApiBearerAuth()
@Controller('system')
export class SystemController {
  constructor(private readonly service: SystemService) {}

  @Public()
  @Get('health')
  health() {
    return this.service.health();
  }
}
