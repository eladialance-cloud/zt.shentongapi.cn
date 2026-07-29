import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { LandingService } from './landing.service';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';
import { UpdateBlockOrderDto } from './dto/update-block-order.dto';
import { LandingBlockEntity } from './entities/landing-block.entity';

/**
 * 管理端 Landing 控制器
 * 数据合同真源：Landing 内容管理模块
 *
 * 端点：
 *   GET    /admin/landing/blocks        区块列表
 *   POST   /admin/landing/blocks        新增区块
 *   PUT    /admin/landing/blocks/:id    编辑区块
 *   DELETE /admin/landing/blocks/:id     删除区块
 *   PATCH  /admin/landing/blocks/order   批量更新排序
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-Landing')
@ApiBearerAuth()
@Public()
@Controller('admin/landing')
@UseGuards(AdminGuard)
export class AdminLandingController {
  constructor(private readonly landingService: LandingService) {}

  @Get('blocks')
  @ApiOperation({ summary: 'Landing 区块列表' })
  async list(): Promise<LandingBlockEntity[]> {
    return this.landingService.findAll();
  }

  @Post('blocks')
  @ApiOperation({ summary: '新增 Landing 区块' })
  async create(@Body() dto: CreateBlockDto): Promise<LandingBlockEntity> {
    return this.landingService.create(dto);
  }

  @Put('blocks/:id')
  @ApiOperation({ summary: '编辑 Landing 区块' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBlockDto,
  ): Promise<void> {
    await this.landingService.update(id, dto);
  }

  @Delete('blocks/:id')
  @ApiOperation({ summary: '删除 Landing 区块' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.landingService.remove(id);
  }

  @Patch('blocks/order')
  @ApiOperation({ summary: '批量更新 Landing 区块排序' })
  async updateOrder(@Body() dto: UpdateBlockOrderDto): Promise<void> {
    await this.landingService.updateOrder(dto.orders);
  }
}
