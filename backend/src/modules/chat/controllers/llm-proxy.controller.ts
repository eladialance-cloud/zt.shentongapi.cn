import {
  Controller, Get, Post, Body, Headers, Param, Res, BadRequestException,
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

  @Public()
  @Post('v1/images/generations')
  async imagesGenerations(
    @Headers('authorization') auth: string,
    @Body() body: { model?: string; prompt: string; size?: string; n?: number },
  ) {
    const token = this.extractToken(auth);
    return this.llmProxyService.imagesGeneration(token, body);
  }

  @Public()
  @Post('v1/audio/speech')
  async audioSpeech(
    @Headers('authorization') auth: string,
    @Body() body: { model?: string; input: string; voice?: string; speed?: number },
    @Res() res: Response,
  ) {
    const token = this.extractToken(auth);
    const { buffer, contentType } = await this.llmProxyService.audioSpeech(token, body);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Public()
  @Post('v1/videos/generations')
  async videoGenerations(
    @Headers('authorization') auth: string,
    @Body() body: { model?: string; prompt: string; resolution?: string; duration?: number; fps?: number },
  ) {
    const token = this.extractToken(auth);
    return this.llmProxyService.videoGeneration(token, body);
  }

  @Public()
  @Get('v1/videos/generations/:id')
  async videoJob(@Headers('authorization') auth: string, @Param('id') id: string) {
    const token = this.extractToken(auth);
    const jobId = Number(id);
    if (!Number.isInteger(jobId) || jobId <= 0) throw new BadRequestException('无效的任务 ID');
    return this.llmProxyService.videoJob(token, jobId);
  }

  private extractToken(auth: string): string {
    if (!auth?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing or invalid Authorization header');
    }
    return auth.slice(7).trim();
  }
}
