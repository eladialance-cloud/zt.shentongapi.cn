import {
  Controller, Get, Post, Body, Headers, Param, Res, BadRequestException, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
      files?: string[];
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

  @Public()
  @Post('v1/files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        model: { type: 'string', description: '模型 ID（可选，缺省用用户默认对话模型）' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @Headers('authorization') auth: string,
    @Body('model') model: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('请上传文件（multipart 字段名 file）');
    return this.llmProxyService.uploadLlmFileByToken(this.extractToken(auth), model, file);
  }

  @Public()
  @Post('v1/embeddings')
  async embeddings(
    @Headers('authorization') auth: string,
    @Body() body: { model: string; input: string | string[] },
  ) {
    return this.llmProxyService.embeddings(this.extractToken(auth), body);
  }

  @Public()
  @Post('v1/rerank')
  async rerank(
    @Headers('authorization') auth: string,
    @Body() body: { model: string; query: string; documents: string[]; top_n?: number },
  ) {
    return this.llmProxyService.rerank(this.extractToken(auth), body);
  }

  @Public()
  @Post('v1/ocr')
  async ocr(
    @Headers('authorization') auth: string,
    @Body() body: { model: string; imageUrl?: string; fileUrl?: string },
  ) {
    return this.llmProxyService.ocr(this.extractToken(auth), body);
  }

  @Public()
  @Post('v1/audio/transcriptions')
  async audioTranscriptions(
    @Headers('authorization') auth: string,
    @Body() body: { model: string; audioUrl: string; language?: string },
  ) {
    return this.llmProxyService.stt(this.extractToken(auth), body);
  }

  @Public()
  @Post('v1/audio/voice-conversion')
  async audioVoiceConversion(
    @Headers('authorization') auth: string,
    @Body() body: { model: string; audioUrl: string; referenceUrl?: string },
  ) {
    return this.llmProxyService.voiceConversion(this.extractToken(auth), body);
  }

  @Public()
  @Post('v1/music/generations')
  async musicGenerations(
    @Headers('authorization') auth: string,
    @Body() body: { model?: string; prompt: string; duration?: number },
  ) {
    const token = this.extractToken(auth);
    return this.llmProxyService.musicGeneration(token, body);
  }

  @Public()
  @Get('v1/realtime')
  realtimeStub() {
    throw new BadRequestException('实时语音对话尚未开放（P5 预留路由桩）');
  }

  private extractToken(auth: string): string {
    if (!auth?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing or invalid Authorization header');
    }
    return auth.slice(7).trim();
  }
}
