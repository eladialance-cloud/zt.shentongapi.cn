import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AdminGuard } from '../admin-auth/admin.guard';
import { AdminSystemService } from './admin-system.service';
import { SystemLlmService } from '../oral-workshop/system-llm.service';
import { listTemplates, saveCustomTemplate, deleteCustomTemplate, toTemplateMeta, TemplateLoadError } from '../oral-workshop/template-loader';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { ClearCacheDto } from './dto/clear-cache.dto';

/**
 * 管理端系统配置控制器
 * 数据合同真源：Task 28 - 系统配置 / frontend admin-system-api.ts
 *
 * 端点：
 *   GET    /admin/system/config        获取系统配置（按 section）
 *   PUT    /admin/system/config        更新系统配置
 *   POST   /admin/system/cache/clear   清空缓存
 *
 * @Public 跳过全局 JwtAuthGuard（用户端 JWT），由 AdminGuard 校验 adminToken。
 */
@ApiTags('管理端-系统配置')
@ApiBearerAuth()
@Public()
@Controller('admin/system')
@UseGuards(AdminGuard)
export class AdminSystemController {
  constructor(
    private readonly service: AdminSystemService,
    private readonly systemLlm: SystemLlmService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: '获取系统配置（按 section）' })
  async getConfig(
    @Query('section') section: string,
  ): Promise<Record<string, unknown>> {
    return this.service.getSystemConfig(section);
  }

  @Put('config')
  @ApiOperation({ summary: '更新系统配置' })
  async updateConfig(@Body() dto: UpdateSystemConfigDto) {
    await this.service.updateSystemConfig(dto);
    return null;
  }


  @Get('oral-workshop/templates')
  @ApiOperation({ summary: '口播工坊视频模板列表（内置+自定义，含预览图）' })
  listOralWorkshopTemplates() {
    try {
      return listTemplates().map((t) => toTemplateMeta(t));
    } catch (err) {
      throw new BadRequestException('模板列表加载失败: ' + (err as Error).message);
    }
  }

  @Post('oral-workshop/templates')
  @ApiOperation({ summary: '上传自定义视频模板（JSON 内容 + 可选封面 URL）' })
  createOralWorkshopTemplate(@Body() body: { templateJson?: string; coverImageUrl?: string }) {
    if (!body?.templateJson?.trim()) throw new BadRequestException('templateJson 不能为空');
    try {
      return toTemplateMeta(saveCustomTemplate(body.templateJson, body.coverImageUrl?.trim() || undefined));
    } catch (err) {
      if (err instanceof TemplateLoadError) throw new BadRequestException(err.message);
      throw new BadRequestException('模板保存失败: ' + (err as Error).message);
    }
  }

  @Delete('oral-workshop/templates/:id')
  @ApiOperation({ summary: '删除自定义视频模板（内置模板不可删除）' })
  deleteOralWorkshopTemplate(@Param('id') id: string) {
    const ok = deleteCustomTemplate(id);
    if (!ok) throw new BadRequestException('模板不存在或为内置模板，不可删除: ' + id);
    return null;
  }

  @Post('oral-workshop/test-llm')
  @ApiOperation({ summary: '口播工坊 LLM 测试连接（火山方舟/自定义 baseUrl+apiKey+model 三元组）' })
  async testOralWorkshopLlm(@Body() body: { baseUrl?: string; apiKey?: string; model?: string }) {
    return this.systemLlm.testConnection({
      baseUrl: body?.baseUrl,
      apiKey: body?.apiKey,
      model: body?.model,
    });
  }
  @Post('oral-workshop/test-capability')
  @ApiOperation({ summary: '口播工坊云端能力测试（tts/clone/dh/stt/embedding，用传入配置不落库）' })
  async testOralWorkshopCapability(@Body() body: { type?: string; config?: Record<string, unknown> }) {
    return this.systemLlm.testCapability(body?.type || '', body?.config ?? {});
  }
  @Post('oral-workshop/list-models')
  @ApiOperation({ summary: '口播工坊 LLM 模型列表（baseUrl+apiKey 拉取可用模型）' })
  async listOralWorkshopModels(@Body() body: { baseUrl?: string; apiKey?: string; source?: string }) {
    return this.systemLlm.listModels({
      baseUrl: body?.baseUrl,
      apiKey: body?.apiKey,
      source: body?.source,
    });
  }
  @Post('cache/clear')
  @ApiOperation({ summary: '清空缓存' })
  async clearCache(@Body() dto: ClearCacheDto) {
    await this.service.clearCache(dto);
    return null;
  }
}
