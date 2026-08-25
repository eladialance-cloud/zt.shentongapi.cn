import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MembershipGuard, RequireFeature } from '../payment/guards/membership.guard';
import { CurrentUser, ICurrentUser } from '../../common/decorators/current-user.decorator';
import { OralWorkshopService } from './oral-workshop.service';
import { OralWorkshopPublisher } from './publisher';
import {
  BatchCreateOralWorkshopJobsDto,
  CreateDigitalHumanAssetDto,
  CreateOralWorkshopJobDto,
  CreateVoiceAssetDto,
  ExtractScriptDto,
  GenerateTopicsDto,
  OralWorkshopJobQueryDto,
} from './dto/oral-workshop.dto';

@ApiTags('口播工坊')
@ApiBearerAuth()
@Controller('oral-workshop')
@UseGuards(JwtAuthGuard, MembershipGuard)
export class OralWorkshopController {
  constructor(
    private readonly oralWorkshopService: OralWorkshopService,
    private readonly publisher: OralWorkshopPublisher,
  ) {}

  @Post('jobs')
  @ApiOperation({ summary: '创建口播工坊任务（预扣 Credits，返回任务+步骤）' })
  create(@CurrentUser() user: ICurrentUser, @Body() dto: CreateOralWorkshopJobDto) {
    return this.oralWorkshopService.create(user.userId, dto);
  }

  @Post('jobs/batch')
  @ApiOperation({ summary: '批量矩阵化建单（文案 × 模板 × 声音 × 形象，逐单预扣 Credits）' })
  createBatch(@CurrentUser() user: ICurrentUser, @Body() dto: BatchCreateOralWorkshopJobsDto) {
    return this.oralWorkshopService.createBatch(user.userId, dto);
  }

  @Post('extract-script')
  @ApiOperation({ summary: '学习对标：从对标视频 URL 提取口播文案（下载+抽音频+STT，不计费）' })
  extractScript(@CurrentUser() user: ICurrentUser, @Body() body: ExtractScriptDto) {
    if (!body?.videoUrl) throw new BadRequestException('videoUrl 不能为空');
    return this.oralWorkshopService.extractScript(user.userId, body.videoUrl);
  }

  @Post('jobs/:id/title')
  @ApiOperation({ summary: '生成封面标题（主标题+副标题，AI）' })
  generateCoverTitle(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    return this.oralWorkshopService.generateCoverTitle(user.userId, Number(id));
  }

  @Post('jobs/:id/cover')
  @ApiOperation({ summary: '保存封面设计（封面图 URL + 主/副标题 + 设计配置）' })
  saveCover(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() body: { coverUrl: string; coverH1?: string; coverH2?: string; coverConfig?: string },
  ) {
    return this.oralWorkshopService.saveCover(user.userId, Number(id), body);
  }
  @Get('jobs')
  @ApiOperation({ summary: '我的口播工坊任务列表（分页）' })
  list(@CurrentUser() user: ICurrentUser, @Query() query: OralWorkshopJobQueryDto) {
    return this.oralWorkshopService.list(user.userId, query);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: '任务详情（含 7 步状态）' })
  get(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.oralWorkshopService.get(user.userId, jobId);
  }


  // ===== 工作台元数据（音色池 + 积分定价） =====
  @Get('meta')
  @ApiOperation({ summary: '工作台元数据：官方音色池 + 档位积分定价' })
  workshopMeta() {
    return this.oralWorkshopService.getWorkshopMeta();
  }

  // ===== 官方音色池 =====
  @Get('voice-pool')
  @ApiOperation({ summary: '官方音色池（管理后台维护，创建任务时可选）' })
  listVoicePool() {
    return this.oralWorkshopService.getVoicePool();
  }

  // ===== 我的声音资产 =====
  @Get('voices')
  @ApiOperation({ summary: '我的声音列表' })
  listVoices(@CurrentUser() user: ICurrentUser) {
    return this.oralWorkshopService.listVoices(user.userId);
  }

  @Post('voices')
  @ApiOperation({ summary: '新增声音（参考音频 URL）' })
  createVoice(@CurrentUser() user: ICurrentUser, @Body() dto: CreateVoiceAssetDto) {
    return this.oralWorkshopService.createVoice(user.userId, dto);
  }

  @Delete('voices/:id')
  @ApiOperation({ summary: '删除声音' })
  deleteVoice(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const voiceId = Number(id);
    if (!Number.isInteger(voiceId) || voiceId <= 0) throw new BadRequestException('无效的声音 ID');
    return this.oralWorkshopService.deleteVoice(user.userId, voiceId);
  }

  // ===== 我的数字人形象 =====
  @Get('digital-humans')
  @ApiOperation({ summary: '我的数字人形象列表' })
  listDigitalHumans(@CurrentUser() user: ICurrentUser) {
    return this.oralWorkshopService.listDigitalHumans(user.userId);
  }

  @Post('digital-humans')
  @ApiOperation({ summary: '新增数字人形象（火山形象 ID）' })
  createDigitalHuman(@CurrentUser() user: ICurrentUser, @Body() dto: CreateDigitalHumanAssetDto) {
    return this.oralWorkshopService.createDigitalHuman(user.userId, dto);
  }

  @Delete('digital-humans/:id')
  @ApiOperation({ summary: '删除数字人形象' })
  deleteDigitalHuman(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const dhId = Number(id);
    if (!Number.isInteger(dhId) || dhId <= 0) throw new BadRequestException('无效的形象 ID');
    return this.oralWorkshopService.deleteDigitalHuman(user.userId, dhId);
  }

  // ===== 选题灵感 =====
  @Post('topics')
  @ApiOperation({ summary: '选题灵感：关键词 + 人设 → 5 个选题' })
  generateTopics(@CurrentUser() user: ICurrentUser, @Body() dto: GenerateTopicsDto) {
    return this.oralWorkshopService.generateTopics(user.userId, dto);
  }

  @Get('templates')
  @ApiOperation({ summary: '可用模板列表（工作台选择）' })
  listTemplates() {
    return this.oralWorkshopService.listTemplates();
  }

  @Post('jobs/:id/export')
  @ApiOperation({ summary: '导出发布包（生成 publish_plans 记录，幂等）' })
  @RequireFeature('export_package')
  exportPackage(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.publisher.exportPackage(user.userId, jobId);
  }

  @Post('jobs/:id/advance')
  @ApiOperation({ summary: '手动/单步模式：执行下一步（放行暂停任务）' })
  advance(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.oralWorkshopService.advance(user.userId, jobId);
  }

  @Post('jobs/:id/cancel')
  @ApiOperation({ summary: '取消任务（退还预扣 Credits）' })
  cancel(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.oralWorkshopService.cancel(user.userId, jobId);
  }
}
