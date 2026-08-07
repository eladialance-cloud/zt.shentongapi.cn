import { Body, Controller, Get, Param, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MediaGenerationService } from './media-generation.service';
import { GenerateImageDto, GenerateVideoDto, MediaJobQueryDto } from './dto/generate-media.dto';
import { CurrentUser, ICurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('媒体生成')
@ApiBearerAuth()
@Controller('media-generation')
export class MediaGenerationController {
  constructor(private readonly mediaGenerationService: MediaGenerationService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.mediaGenerationService.health();
  }

  @Get('models')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '可选生成模型列表（文生图/文生视频）' })
  listModels() {
    return this.mediaGenerationService.listGenerationModels();
  }

  @Post('image')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '文生图（同步返回，扣积分）' })
  generateImage(@CurrentUser() user: ICurrentUser, @Body() dto: GenerateImageDto) {
    return this.mediaGenerationService.generateImage(user.userId, dto);
  }

  @Post('video')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '文生视频（异步任务，轮询结果）' })
  generateVideo(@CurrentUser() user: ICurrentUser, @Body() dto: GenerateVideoDto) {
    return this.mediaGenerationService.generateVideo(user.userId, dto);
  }

  @Get('jobs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '我的生成记录' })
  listJobs(@CurrentUser() user: ICurrentUser, @Query() query: MediaJobQueryDto) {
    return this.mediaGenerationService.listJobs(user.userId, query);
  }

  @Get('jobs/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '生成任务详情（视频轮询）' })
  getJob(@CurrentUser() user: ICurrentUser, @Param('id') id: string) {
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.mediaGenerationService.getJob(user.userId, jobId);
  }
}
