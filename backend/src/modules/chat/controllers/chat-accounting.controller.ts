import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { ChatAccountingService } from '../services/chat-accounting.service';

/**
 * OpenClaw 本地直达对话记账接口（JWT 保护，未登录 401）
 * - GET  /api/chat/accounting/proxy-key       返回/生成用户 llm-proxy 静态 Key
 * - POST /api/chat/accounting/preferred-model 保存用户默认对话模型
 * - POST /api/chat/accounting/tool            有定价工作流额外扣费
 *
 * 对话本体扣费已收敛到 llm-proxy（/api/llm-proxy/v1/chat/completions 按后台定价扣费），
 * 不再提供 start/settle（避免双重扣费）。
 */
@ApiTags('对话记账')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat/accounting')
export class ChatAccountingController {
  constructor(private readonly svc: ChatAccountingService) {}

  @Get('proxy-key')
  @ApiOperation({ summary: '返回/生成用户 llm-proxy 静态 Key' })
  getProxyKey(@CurrentUser() u: ICurrentUser) {
    return this.svc.getOrCreateProxyKey(u.userId);
  }

  @Post('preferred-model')
  @ApiOperation({ summary: '保存用户默认对话模型' })
  setPreferredModel(@CurrentUser() u: ICurrentUser, @Body() b: { modelId: string }) {
    return this.svc.setPreferredModel(u.userId, b.modelId);
  }

  @Post('tool')
  @ApiOperation({ summary: '有定价工作流额外扣费' })
  tool(@CurrentUser() u: ICurrentUser, @Body() b: { workflowId: number }) {
    return this.svc.chargeTool(u.userId, b.workflowId);
  }
}