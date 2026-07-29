import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RuntimeService, RuntimeCheckUpdateResult } from './services/runtime.service';

/**
 * 运行时引擎版本控制器
 * 数据合同真源：深瞳AI_全栈部署方案_20260708.md 第 3.3 节
 * 桌面端通过此接口检查引擎是否有新版本可热更新
 */
@ApiTags('运行时引擎')
@Controller('api/runtime')
export class RuntimeController {
  constructor(private readonly service: RuntimeService) {}

  @Get('check-update')
  @Public()
  @ApiOperation({ summary: '检查引擎更新（桌面端调用）' })
  async checkUpdate(
    @Query('platform') platform: string,
  ): Promise<RuntimeCheckUpdateResult> {
    return this.service.checkUpdate(platform || 'win32-x64');
  }
}
