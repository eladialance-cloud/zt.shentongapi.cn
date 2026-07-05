import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from '../services/chat.service';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '../../../common/decorators/current-user.decorator';

/**
 * 发送消息 DTO（流式）
 * 与客户端 SendMessageDto 对齐
 */
class SendMessageStreamDto {
  content: string;
  attachments?: string[];
}

@ApiTags('聊天')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.chatService.health();
  }

  /**
   * SSE 流式发送消息
   * POST /chat/sessions/:id/messages/stream
   *
   * 返回 text/event-stream，事件类型：
   *   message       { content: string }                  流式文本块
   *   tool_call     { id, name, input, output, ... }     工具调用
   *   credits       { amount, balance, frozen }          计费信息
   *   done          { usage: TokenUsage }                完成
   *   error         { message: string }                  错误
   *
   * 当前实现：占位 mock（直接返回模拟流式数据），后续集成 OpenClaw 真实引擎
   */
  @Post('sessions/:id/messages/stream')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'SSE 流式发送消息' })
  async streamMessage(
    @Param('id') _id: string,
    @Body() dto: SendMessageStreamDto,
    @CurrentUser() _user: ICurrentUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!dto?.content || !dto.content.trim()) {
      throw new BadRequestException('消息内容不能为空');
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
    res.flushHeaders?.();

    // 模拟流式输出：将输入内容回显 + 一些固定文本
    const echoText = `收到你的消息：「${dto.content}」\n\n这是来自 OpenClaw 引擎的占位流式响应。`;
    const chunks = this.chunkText(echoText, 6);

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // 1. 模拟工具调用（开始）
      send('tool_call', {
        id: `tc-${Date.now()}`,
        name: 'mock_search',
        input: { query: dto.content },
        output: null,
        duration: 0,
        creditsCost: 0,
        status: 'running',
      });

      // 2. 等待一小段时间模拟工具执行
      await this.sleep(400);

      // 3. 工具调用完成
      send('tool_call', {
        id: `tc-${Date.now()}`,
        name: 'mock_search',
        input: { query: dto.content },
        output: { results: ['占位结果 1', '占位结果 2'] },
        duration: 400,
        creditsCost: 2,
        status: 'success',
      });

      // 4. 流式文本块
      for (const chunk of chunks) {
        send('message', { content: chunk });
        await this.sleep(60);
      }

      // 5. 计费信息
      send('credits', {
        amount: 5,
        balance: 995,
        frozen: 0,
      });

      // 6. 完成
      const promptTokens = Math.ceil(dto.content.length / 2);
      const completionTokens = Math.ceil(echoText.length / 2);
      send('done', {
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      });

      res.end();
    } catch (err) {
      send('error', { message: (err as Error).message || '流式响应错误' });
      res.end();
    }
  }

  /** 将文本按指定长度切分 */
  private chunkText(text: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.slice(i, i + size));
    }
    return chunks;
  }

  /** sleep 工具 */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
