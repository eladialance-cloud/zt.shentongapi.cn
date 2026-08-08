import {
  Controller, Get, Post, Body, Headers, Res, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { LlmProxyService } from '../services/llm-proxy.service';

@ApiTags('LLM 代理')
@Controller('llm-proxy')
export class LlmProxyController {
  constructor(private readonly llmProxyService: LlmProxyService) {}

  @Public()
  @Get('health')
  health() { return this.llmProxyService.health(); }

  @Public()
  @Get('v1/models')
  async models(@Headers('authorization') auth: string) {
    const token = this.extractToken(auth);
    return { object: 'list', data: await this.llmProxyService.getModels(token) };
  }

  @Public()
  @Post('v1/chat/completions')
  async chatCompletions(
    @Headers('authorization') auth: string,
    @Body() body: {
      model: string;
      messages: Array<{ role: string; content: string | unknown[] }>;
      stream?: boolean;
      temperature?: number;
      max_tokens?: number;
      tools?: unknown[];
    },
    @Res() res: Response,
  ) {
    const token = this.extractToken(auth);
    const result = await this.llmProxyService.chatCompletions(token, body);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let closed = false;
    res.on('close', () => { closed = true; });

    try {
      for await (const chunk of result.iterator) {
        if (closed) break;
        res.write(chunk);
      }
    } catch (err) {
      if (!closed) {
        res.write(`data: ${JSON.stringify({ error: { message: (err as Error).message } })}\n\n`);
      }
    } finally {
      if (!closed) { closed = true; res.end(); }
    }
  }

  private extractToken(auth: string): string {
    if (!auth?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing or invalid Authorization header');
    }
    return auth.slice(7).trim();
  }
}
