import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { TenantService } from '../services/tenant.service';

@ApiTags('租户/团队')
@ApiBearerAuth()
@Controller('tenant')
export class TenantController {
  constructor(private readonly service: TenantService) {}

  @Public()
  @Get('health')
  health() {
    return this.service.health();
  }
}
