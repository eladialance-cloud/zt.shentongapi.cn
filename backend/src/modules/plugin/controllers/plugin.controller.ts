import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PluginService } from '../services/plugin.service';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('插件')
@ApiBearerAuth()
@Controller('plugins')
export class PluginController {
  constructor(private readonly pluginService: PluginService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.pluginService.health();
  }
}
