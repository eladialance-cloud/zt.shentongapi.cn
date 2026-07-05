import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyPoolService } from './services/api-key-pool.service';
import { ApiKeyPoolEntity } from './entities/api-key-pool.entity';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

class CreateKeyDto {
  provider: string;
  apiKey: string;
  alias?: string;
  priority?: number;
  modelConfigId?: number;
  totalQuota?: number;
  dailyQuota?: number;
  monthlyQuota?: number;
}

class UpdateKeyDto {
  provider?: string;
  apiKey?: string;
  alias?: string;
  priority?: number;
  status?: string;
  modelConfigId?: number;
  totalQuota?: number;
}

class SetLimitsDto {
  dailyQuota?: number;
  monthlyQuota?: number;
}

/**
 * API Key 池管理端控制器
 * 数据合同真源：Task 32 - 数据安全设计
 */
@ApiTags('API Key 池-管理端')
@ApiBearerAuth()
@Controller('admin/api-key-pool')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
export class ApiKeyPoolController {
  constructor(private readonly service: ApiKeyPoolService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.service.health();
  }

  @Get()
  @ApiOperation({ summary: 'Key 列表' })
  async list(@Query('provider') provider?: string) {
    return this.service.list(provider);
  }

  @Get('stats')
  @ApiOperation({ summary: '统计' })
  async stats() {
    return this.service.getStats();
  }

  @Post()
  @ApiOperation({ summary: '新增 Key' })
  async create(@Body() dto: CreateKeyDto) {
    return this.service.create(dto as Partial<ApiKeyPoolEntity>);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑 Key' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKeyDto,
  ) {
    return this.service.update(id, dto as Partial<ApiKeyPoolEntity>);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除 Key' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.delete(id);
    return null;
  }

  @Post(':id/reset-errors')
  @ApiOperation({ summary: '重置错误计数' })
  async resetErrors(@Param('id', ParseIntPipe) id: number) {
    await this.service.resetErrors(id);
    return null;
  }

  @Patch(':id/limits')
  @ApiOperation({ summary: '设置限额' })
  async setLimits(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetLimitsDto,
  ) {
    return this.service.setLimits(id, dto.dailyQuota, dto.monthlyQuota);
  }
}
