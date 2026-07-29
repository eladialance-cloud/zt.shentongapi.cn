import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LandingService } from './landing.service';
import { LandingBlockEntity } from './entities/landing-block.entity';

/**
 * 公开 Landing 控制器
 * 数据合同真源：Landing 内容管理模块
 *
 * 端点：
 *   GET /landing/content       已启用区块内容
 *   GET /landing/blocks/:id    单个区块详情
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），无需登录即可访问。
 */
@ApiTags('Landing-公开')
@Public()
@Controller('landing')
export class LandingController {
  constructor(private readonly landingService: LandingService) {}

  @Get('content')
  @ApiOperation({ summary: '获取已启用 Landing 区块内容' })
  async content(): Promise<LandingBlockEntity[]> {
    return this.landingService.findAllEnabled();
  }

  @Get('blocks/:id')
  @ApiOperation({ summary: '获取单个 Landing 区块' })
  async findOne(@Param('id') id: string): Promise<LandingBlockEntity> {
    return this.landingService.findOne(id);
  }
}
