import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { OpcService } from '../services/opc.service';

@ApiTags('OPC协作')
@ApiBearerAuth()
@Controller('opc')
export class OpcController {
  constructor(private readonly service: OpcService) {}

  @Public()
  @Get('health')
  health() {
    return this.service.health();
  }
}
