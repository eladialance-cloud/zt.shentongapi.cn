import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModelService } from '../services/model.service';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('模型')
@ApiBearerAuth()
@Controller('models')
export class ModelController {
  constructor(private readonly modelService: ModelService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.modelService.health();
  }

  @Get()
  @ApiOperation({ summary: '可用模型列表（创作者选择用）' })
  listOptions() {
    return this.modelService.listOptions();
  }
}
