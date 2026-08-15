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
import { FetchModelsDto } from './dto/fetch-models.dto';
import { ImportModelsDto } from './dto/import-models.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { MarketImportDto } from './dto/market-import.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { TestProviderDto } from './dto/test-provider.dto';
import { ImportProviderModelsDto } from './dto/import-provider-models.dto';
import {
  BatchEnableDto,
  BatchPriceDto,
  CreateFromTemplateDto,
  ImportModelsJsonDto,
} from './dto/batch-model.dto';

/**
 * 管理端大模型配置控制器
 *
 * 模型端点：
 *   GET    /admin/models                      模型列表
 *   GET    /admin/models/:id                  模型详情
 *   POST   /admin/models                      新增模型（兼容旧接口）
 *   PATCH  /admin/models/:id                  编辑模型
 *   DELETE /admin/models/:id                  删除模型
 *   POST   /admin/models/:id/enable           上架
 *   POST   /admin/models/:id/disable          下架
 *   POST   /admin/models/:id/test             测试模型
 *   POST   /admin/models/:id/sync             手动同步 OpenClaw
 *   POST   /admin/models/batch-enable         批量上架/下架
 *   POST   /admin/models/batch-price          批量改价
 *   GET    /admin/models/export               导出配置 JSON
 *   POST   /admin/models/import               批量导入配置 JSON
 *   GET    /admin/models/market/vendors    模型市场：厂商列表
 *   GET    /admin/models/market/presets    模型市场：厂商预设列表
 *   POST   /admin/models/market/import     模型市场：批量创建模型
 *
 * 供应商端点（v0.7.0+ 新流程）：
 *   GET    /admin/models/providers            供应商列表
 *   POST   /admin/models/providers            新增供应商
 *   PATCH  /admin/models/providers/:id        编辑供应商
 *   DELETE /admin/models/providers/:id        删除供应商
 *   POST   /admin/models/providers/test       测试连接（可未保存直接测）
 *   POST   /admin/models/providers/:id/fetch-models   读取上游模型列表
 *   POST   /admin/models/providers/:id/import         勾选逐模型定价导入
 *
 * 旧中转站接口（兼容旧页面）：
 *   POST   /admin/models/proxy/fetch-models
 *   POST   /admin/models/proxy/import
 */
@ApiTags('管理端-大模型配置')
@ApiBearerAuth()
@Public()
@Controller('admin/models')
@UseGuards(AdminGuard)
export class AdminModelController {
  constructor(private readonly service: AdminModelService) {}

  // ============ 模型 ============


// ============ 列表 / 供应商（静态段必须先于 :id 参数段注册）============

  @Get()
  @ApiOperation({ summary: '模型列表' })
  async list(@Query() query: Record<string, unknown>) {
    return this.service.list(query as any);
  }

  /** 动态表单元数据：调用模式 + 规格字段 schema + 场景标签 + 高级能力标签 */
  @Get('call-modes')
  @ApiOperation({ summary: '调用模式元数据（动态表单）' })
  callModesMeta() {
    return this.service.callModesMeta();
  }

  /** 模板库列表 */
  @Get('templates')
  @ApiOperation({ summary: '模板库列表' })
  templateList() {
    return this.service.templateList();
  }

  /** 模型市场：厂商列表（含是否已创建供应商） */
  @Get('market/vendors')
  @ApiOperation({ summary: '模型市场：厂商列表' })
  async marketVendors() {
    return this.service.marketVendors();
  }

  /** 模型市场：某厂商预设列表 */
  @Get('market/presets')
  @ApiOperation({ summary: '模型市场：厂商预设列表' })
  async marketPresets(@Query('vendor') vendor: string) {
    return this.service.marketPresets(vendor);
  }

  /** 模型市场：批量创建模型 */
  @Post('market/import')
  @ApiOperation({ summary: '模型市场：批量创建模型' })
  async marketImport(@Body() dto: MarketImportDto) {
    return this.service.marketImport(dto);
  }

  /** 从模板创建模型 */
  @Post('from-template')
  @ApiOperation({ summary: '从模板创建模型' })
  createFromTemplate(@Body() dto: CreateFromTemplateDto) {
    return this.service.createFromTemplate(dto);
  }

  /** 批量上架/下架 */
  @Post('batch-enable')
  @ApiOperation({ summary: '批量上架/下架' })
  batchEnable(@Body() dto: BatchEnableDto) {
    return this.service.batchEnable(dto);
  }

  /** 批量改价 */
  @Post('batch-price')
  @ApiOperation({ summary: '批量改价' })
  batchUpdatePrice(@Body() dto: BatchPriceDto) {
    return this.service.batchUpdatePrice(dto);
  }

  /** 导出配置 JSON */
  @Get('export')
  @ApiOperation({ summary: '导出配置 JSON' })
  exportModels(@Query() query: any) {
    return this.service.exportModels(query);
  }

  /** 批量导入配置 JSON */
  @Post('import')
  @ApiOperation({ summary: '批量导入配置 JSON' })
  importModelsJson(@Body() dto: ImportModelsJsonDto) {
    return this.service.importModelsJson(dto);
  }
  @Get('providers')
  @ApiOperation({ summary: '供应商列表' })
  async providerList() {
    return this.service.providerList();
  }

// ============ 供应商 CRUD / 测试 / 导入 ============

  @Post('providers')
  @ApiOperation({ summary: '新增第三方供应商' })
  async createProvider(@Body() dto: CreateProviderDto) {
    return this.service.createProvider(dto);
  }

  @Patch('providers/:id')
  @ApiOperation({ summary: '编辑供应商' })
  async updateProvider(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProviderDto,
  ) {
    await this.service.updateProvider(id, dto);
  }

  @Delete('providers/:id')
  @ApiOperation({ summary: '删除供应商' })
  async removeProvider(@Param('id', ParseIntPipe) id: number) {
    await this.service.removeProvider(id);
  }

  @Post('providers/test')
  @ApiOperation({ summary: '测试供应商连接' })
  async testProvider(@Body() dto: TestProviderDto) {
    return this.service.testProvider(dto);
  }

  /** 立即检查供应商余额 */
  @Post('providers/:id/check-balance')
  @ApiOperation({ summary: '立即检查供应商余额' })
  checkProviderBalance(@Param('id', ParseIntPipe) id: number) {
    return this.service.checkProviderBalance(id);
  }

  @Post('providers/:id/fetch-models')
  @ApiOperation({ summary: '读取上游模型列表' })
  async fetchProviderModels(@Param('id', ParseIntPipe) id: number) {
    return this.service.fetchProviderModels(id);
  }

  @Post('providers/:id/import')
  @ApiOperation({ summary: '勾选逐模型定价导入' })
  async importProviderModels(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ImportProviderModelsDto,
  ) {
    return this.service.importProviderModels(id, dto);
  }

  // ============ 旧中转站 ============


  @Post('proxy/fetch-models')
  @ApiOperation({ summary: '拉取上游模型列表（旧接口）' })
  async fetchUpstreamModels(@Body() dto: FetchModelsDto) {
    return this.service.fetchUpstreamModels(dto);
  }

  @Post('proxy/import')
  @ApiOperation({ summary: '批量导入模型（旧接口）' })
  async importModels(@Body() dto: ImportModelsDto) {
    return this.service.importModels(dto);
  }

// ============ 模型 CRUD / 状态 ============

  @Get(':id')
  @ApiOperation({ summary: '模型详情' })
  async detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  @ApiOperation({ summary: '新增模型（兼容旧接口）' })
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
  @ApiOperation({ summary: '上架模型' })
  async enable(@Param('id', ParseIntPipe) id: number) {
    await this.service.enable(id);
  }

  @Post(':id/disable')
  @ApiOperation({ summary: '下架模型' })
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
