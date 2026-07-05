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
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminModelService } from './admin-model.service';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { TestModelDto } from './dto/test-model.dto';

/**
 * 管理端大模型配置控制器
 * 数据合同真源：Task 23 - 大模型配置
 *
 * 端点：
 *   GET    /admin/models                模型列表
 *   GET    /admin/models/providers      供应商列表
 *   GET    /admin/models/:id            模型详情
 *   POST   /admin/models                新增模型
 *   PATCH  /admin/models/:id            编辑模型
 *   DELETE /admin/models/:id            删除模型
 *   POST   /admin/models/:id/enable     启用模型
 *   POST   /admin/models/:id/disable    禁用模型
 *   POST   /admin/models/:id/test       测试模型
 *   POST   /admin/models/:id/sync       手动同步 OpenClaw
 */
@ApiTags('管理端-大模型配置')
@ApiBearerAuth()
@Public()
@Controller('admin/models')
@UseGuards(AdminGuard)
export class AdminModelController {
  constructor(private readonly service: AdminModelService) {}

  @Get()
  @ApiOperation({ summary: '模型列表' })
  async list(@Query() query: Record<string, unknown>) {
    return this.service.list(query as any);
  }

  @Get('providers')
  @ApiOperation({ summary: '供应商列表' })
  providers() {
    return this.service.providers();
  }

  @Get(':id')
  @ApiOperation({ summary: '模型详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  @ApiOperation({ summary: '新增模型' })
  async create(@Body() dto: CreateModelDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '编辑模型' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateModelDto,
  ) {
    await this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除模型' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
  }

  @Post(':id/enable')
  @ApiOperation({ summary: '启用模型' })
  async enable(@Param('id', ParseIntPipe) id: number) {
    await this.service.enable(id);
  }

  @Post(':id/disable')
  @ApiOperation({ summary: '禁用模型' })
  async disable(@Param('id', ParseIntPipe) id: number) {
    await this.service.disable(id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: '测试模型' })
  async test(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestModelDto,
  ) {
    return this.service.test(id, dto);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: '手动同步 OpenClaw' })
  async sync(@Param('id', ParseIntPipe) id: number) {
    await this.service.sync(id);
  }
}
