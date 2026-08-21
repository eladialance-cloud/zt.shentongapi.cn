import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../common/decorators/current-user.decorator';
import { SedimentationService } from './sedimentation.service';
import { AnalyzeDto, ApplyDto, UndoDto } from './dto/sedimentation.dto';

@ApiTags('sedimentation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sedimentation')
export class SedimentationController {
  constructor(private readonly sedimentationService: SedimentationService) {}

  @Post('analyze')
  @ApiOperation({ summary: '对话沉淀识别（LLM 分类）' })
  analyze(@CurrentUser() user: ICurrentUser, @Body() dto: AnalyzeDto) {
    return this.sedimentationService.analyze(user.userId, dto);
  }

  @Post('apply')
  @ApiOperation({ summary: '应用沉淀（写知识库/记录，记忆由桌面端本地写）' })
  apply(@CurrentUser() user: ICurrentUser, @Body() dto: ApplyDto) {
    return this.sedimentationService.apply(user.userId, dto);
  }

  @Post('undo')
  @ApiOperation({ summary: '撤回沉淀' })
  undo(@CurrentUser() user: ICurrentUser, @Body() dto: UndoDto) {
    return this.sedimentationService.undo(user.userId, dto);
  }

  @Get('feed')
  @ApiOperation({ summary: '最近沉淀记录' })
  feed(@CurrentUser() user: ICurrentUser, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.sedimentationService.feed(user.userId, Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 50);
  }
}