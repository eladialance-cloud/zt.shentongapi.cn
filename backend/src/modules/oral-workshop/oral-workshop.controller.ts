import { Body, Controller, Delete, Get, Param, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  GenerateScriptDto,
  GenerateTopicsDto,
  ProductCopyDto,
  RewriteScriptDto,
  StyleAnalysisDto,
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

  @Get('jobs/stats')
  @ApiOperation({ summary: '任务统计概览（总数/进行中/已完成/失败）' })
  jobStats(@CurrentUser() user: ICurrentUser) {
    return this.oralWorkshopService.jobStats(user.userId);
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
  @ApiOperation({ summary: '工作台元数据：官方音色池 + 档位积分定价 + 人设预设 + BGM 库 + 最近成片预览' })
  workshopMeta(@CurrentUser() user: ICurrentUser) {
    return this.oralWorkshopService.getWorkshopMeta(user.userId);
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

  @Post('digital-humans/upload')
  @ApiOperation({ summary: 'D2：上传真人视频建形象（ffmpeg 转码 MP4/H.264 ≤1080P + 首帧预览）' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  uploadDigitalHuman(@CurrentUser() user: ICurrentUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择要上传的视频文件');
    return this.oralWorkshopService.uploadDigitalHumanVideo(user.userId, file);
  }

    // ===== 发布账号（G：桌面端扫码绑定 + 管理后台平台开关；对标 aigc-human platform_accounts） =====
  @Get('publish-platforms')
  @ApiOperation({ summary: '发布平台开关列表（管理后台配置；桌面端只用启用平台）' })
  listPublishPlatforms() {
    return this.oralWorkshopService.listPublishPlatforms();
  }

  @Put('publish-platforms')
  @ApiOperation({ summary: '保存发布平台开关（管理后台）' })
  savePublishPlatforms(@Body() body: { items: Array<{ platform: string; displayName: string; enabled: boolean; sortOrder: number; remark?: string }> }) {
    return this.oralWorkshopService.savePublishPlatforms(body?.items ?? []);
  }

  @Get('publish-accounts')
  @ApiOperation({ summary: '我的发布账号列表（抖音/快手/小红书/B站/西瓜视频/蝴蝶号）' })
  listPublishAccounts(@CurrentUser() user: ICurrentUser) {
    return this.oralWorkshopService.listPublishAccounts(user.userId);
  }

  @Post('publish-accounts')
  @ApiOperation({ summary: '添加发布账号（占位：pending+offline，绑定由桌面端扫码后调 session 接口）' })
  createPublishAccount(
    @CurrentUser() user: ICurrentUser,
    @Body() body: { platform: string; accountName: string; avatarUrl?: string; remark?: string },
  ) {
    return this.oralWorkshopService.createPublishAccount(user.userId, body);
  }

  @Post('publish-accounts/:id/session')
  @ApiOperation({ summary: '扫码登录成功回填登录态（桌面端采集 cookies 加密上传）' })
  saveAccountSession(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() body: { cookiesJson: string; displayName?: string; expiresAt?: string },
  ) {
    const accountId = Number(id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new BadRequestException('无效的账号 ID');
    return this.oralWorkshopService.saveAccountSession(user.userId, accountId, body);
  }

  @Post('publish-accounts/:id/test-login')
  @ApiOperation({ summary: '测试连接：用 cookie 探测平台登录态（对标 account:test-login）' })
  testAccountLogin(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const accountId = Number(id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new BadRequestException('无效的账号 ID');
    return this.oralWorkshopService.testAccountLogin(user.userId, accountId);
  }

  @Delete('publish-accounts/:id/session')
  @ApiOperation({ summary: '解绑账号：清空登录态（cookies 置空）' })
  clearAccountSession(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const accountId = Number(id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new BadRequestException('无效的账号 ID');
    return this.oralWorkshopService.clearAccountSession(user.userId, accountId);
  }

  @Delete('publish-accounts/:id')
  @ApiOperation({ summary: '删除发布账号' })
  deletePublishAccount(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const accountId = Number(id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new BadRequestException('无效的账号 ID');
    return this.oralWorkshopService.deletePublishAccount(user.userId, accountId);
  }

  @Post('jobs/:id/import-materials')
  @ApiOperation({ summary: '任务产物一键导入素材库（成片/封面/人声轨，幂等）' })
  importJobMaterials(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.oralWorkshopService.importJobMaterials(user.userId, jobId);
  }

  @Post('jobs/:id/publish')
  @ApiOperation({ summary: 'G5：任务发布到账号（多账号批量/直接发布或保存草稿；对标 529 发布面板）' })
  publishJob(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() body: { accountIds: number[]; mode?: 'manual' | 'auto' | 'draft'; title?: string; description?: string },
  ) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.oralWorkshopService.publishJobToAccounts(user.userId, jobId, body ?? { accountIds: [] });
  }

  @Post('jobs/:id/publish-result')
  @ApiOperation({ summary: 'G5：发布结果回写（桌面端完成手动/自动发布后回调）' })
  writePublishResult(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() body: { planId: number; results: Array<{ accountId: number; platform: string; status: 'success' | 'failed'; message?: string }> },
  ) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    if (!Number.isInteger(body?.planId) || body.planId <= 0) throw new BadRequestException('无效的发布计划 ID');
    return this.oralWorkshopService.writePublishResult(user.userId, body.planId, { results: body.results ?? [] });
  }

  @Post('jobs/:id/publish-package')
  @ApiOperation({ summary: '生成发布包：AI 标题/副标题/发布描述/话题标签（供发布面板使用）' })
  generatePublishPackage(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.oralWorkshopService.getPublishPackage(user.userId, jobId);
  }

  @Post('jobs/:id/mix-suggest')
  @ApiOperation({ summary: '画中画素材推荐：字幕逐条抽关键词并检索素材中心，返回 pipAssets 建议' })
  mixSuggest(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.oralWorkshopService.mixSuggest(user.userId, jobId);
  }

  // ===== IP 大脑（对标 aigc-human ip-brain） =====
  @Post('ip-brain/analyze')
  @ApiOperation({ summary: 'IP 大脑：解析对标主页/合集/单视频链接（yt-dlp）→ 风格分析 + 选题存档' })
  analyzeIpArchive(@CurrentUser() user: ICurrentUser, @Body() body: { url?: string }) {
    if (!body?.url?.trim()) throw new BadRequestException('url 不能为空');
    return this.oralWorkshopService.analyzeIpArchive(user.userId, body.url);
  }

  @Get('ip-brain')
  @ApiOperation({ summary: 'IP 大脑档案列表（按创建时间倒序）' })
  listIpArchives(@CurrentUser() user: ICurrentUser) {
    return this.oralWorkshopService.listIpArchives(user.userId);
  }

  @Delete('ip-brain/:id')
  @ApiOperation({ summary: '删除 IP 大脑档案' })
  deleteIpArchive(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const archiveId = Number(id);
    if (!Number.isInteger(archiveId) || archiveId <= 0) throw new BadRequestException('无效的档案 ID');
    return this.oralWorkshopService.deleteIpArchive(user.userId, archiveId);
  }

  @Post('jobs/:id/cancel')
  @ApiOperation({ summary: '取消任务（退还预扣 Credits）' })
  cancel(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.oralWorkshopService.cancel(user.userId, jobId);
  }
}
