import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from '../services/chat.service';
import { LlmProxyService } from '../services/llm-proxy.service';
import { KnowledgeEngineService } from '../../knowledge-engine/knowledge-engine.service';
import { CreditsService } from '../../credits/services/credits.service';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  ICurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { PaginationQuery } from '../../../common/types/pagination.type';

// ============ DTOs ============

/** 创建会话 DTO */
class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

  @IsNotEmpty({ message: 'modelId 不能为空' })
  @IsString()
  modelId: string;

  // 桌面端前端传 number，后端 agent_id 存 VARCHAR(64)，统一转字符串
  @IsOptional()
  @Type(() => String)
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsNumber()
  knowledgeBaseId?: number;

  @IsOptional()
  @IsNumber()
  groupId?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  attachedKnowledgeBaseIds?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  enabledPluginIds?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  enabledWorkflowIds?: number[];
}

/** 更新会话 DTO */
class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsNumber()
  knowledgeBaseId?: number;

  @IsOptional()
  @IsNumber()
  groupId?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  attachedKnowledgeBaseIds?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  enabledPluginIds?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  enabledWorkflowIds?: number[];
}

/** 保存消息 DTO */
class CreateMessageDto {
  @IsIn(['user', 'assistant', 'system', 'tool'])
  role: 'user' | 'assistant' | 'system' | 'tool';

  @IsNotEmpty({ message: '消息内容不能为空' })
  @IsString()
  content: string;

  @IsOptional()
  @IsArray()
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: string;
  }>;

  @IsOptional()
  @IsObject()
  tokenUsage?: { input: number; output: number; total: number };

  @IsOptional()
  @IsNumber()
  creditsCost?: number;

  @IsOptional()
  @IsArray()
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    size: number;
  }>;
}

/** 流式发送消息 DTO */
class SendMessageStreamDto {
  @IsNotEmpty({ message: '消息内容不能为空' })
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

@ApiTags('聊天')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly llmProxyService: LlmProxyService,
    private readonly creditsService: CreditsService,
    private readonly engineService: KnowledgeEngineService,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查' })
  health() {
    return this.chatService.health();
  }

  // ============ 会话 CRUD ============

  @Post('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '创建会话' })
  async createSession(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateSessionDto,
  ) {
    if (!dto.modelId) throw new BadRequestException('modelId 不能为空');
    return this.chatService.createSession(user.userId, dto);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '会话列表' })
  async listSessions(
    @CurrentUser() user: ICurrentUser,
    @Query() query: PaginationQuery,
  ) {
    return this.chatService.listSessions(user.userId, query);
  }

  @Get('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '会话详情' })
  async getSession(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    const sessionId = Number(id);
    if (isNaN(sessionId)) throw new BadRequestException('无效的会话 ID');
    return this.chatService.getSession(user.userId, sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '删除会话' })
  async deleteSession(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
  ) {
    const sessionId = Number(id);
    if (isNaN(sessionId)) throw new BadRequestException('无效的会话 ID');
    await this.chatService.deleteSession(user.userId, sessionId);
    return { success: true };
  }

  @Patch('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '更新会话' })
  async updateSession(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    const sessionId = Number(id);
    if (isNaN(sessionId)) throw new BadRequestException('无效的会话 ID');
    return this.chatService.updateSession(user.userId, sessionId, dto);
  }

  // ============ 消息 CRUD ============

  @Get('sessions/:id/messages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '消息列表' })
  async listMessages(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Query() query: PaginationQuery,
  ) {
    const sessionId = Number(id);
    if (isNaN(sessionId)) throw new BadRequestException('无效的会话 ID');
    // 校验会话归属权
    await this.chatService.getSession(user.userId, sessionId);
    return this.chatService.listMessages(sessionId, query);
  }

  @Post('sessions/:id/messages')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '保存消息' })
  async createMessage(
    @CurrentUser() user: ICurrentUser,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    const sessionId = Number(id);
    if (isNaN(sessionId)) throw new BadRequestException('无效的会话 ID');
    // 校验会话归属权
    await this.chatService.getSession(user.userId, sessionId);
    return this.chatService.createMessage(sessionId, user.userId, dto);
  }

  // ============ 流式聊天 ============

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
   */
  @Post('sessions/:id/messages/stream')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'SSE 流式发送消息' })
  async streamMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageStreamDto,
    @CurrentUser() user: ICurrentUser,
    @Res() res: Response,
  ): Promise<void> {
    if (!dto?.content || !dto.content.trim()) {
      throw new BadRequestException('消息内容不能为空');
    }

    const sessionId = Number(id);
    if (isNaN(sessionId)) throw new BadRequestException('无效的会话 ID');

    // 校验会话归属权并获取会话信息
    const session = await this.chatService.getSession(user.userId, sessionId);

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // 1. 获取或生成用户的 llmProxyKey
      const apiKey = await this.llmProxyService.ensureLlmProxyKey(user.userId);

      // 2. 获取会话历史消息，构建 messages 数组
      const historyMessages = await this.chatService.getSessionMessages(sessionId, 20);
      const messages: Array<{ role: string; content: string }> = [];

      // 添加历史上下文
      for (const msg of historyMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // 添加当前用户消息
      messages.push({ role: 'user', content: dto.content });

      // 2.5 知识库检索注入（会话挂了知识库才注入；不挂库行为与原来完全一致）
      const attachedKbIds = [
        ...(session.knowledgeBaseId ? [session.knowledgeBaseId] : []),
        ...(session.attachedKnowledgeBaseIds ?? []),
      ];
      if (attachedKbIds.length > 0) {
        const refs: string[] = [];
        for (const kbId of [...new Set(attachedKbIds)]) {
          const hits = await this.engineService.retrieveForChat(
            user.userId,
            kbId,
            dto.content,
            5,
          );
          for (const hit of hits) {
            refs.push(`【${hit.documentName || '知识库'}】${hit.content}`);
            if (refs.length >= 10) break;
          }
          if (refs.length >= 10) break;
        }
        if (refs.length > 0) {
          messages.unshift({
            role: 'system',
            content:
              '以下是知识库检索到的参考资料，请优先依据这些资料回答用户问题，不要编造资料外的信息：\n' +
              refs.join('\n'),
          });
        }
      }

      // 3. 保存用户消息到数据库

      await this.chatService.createMessage(sessionId, user.userId, {
        role: 'user',
        content: dto.content,
        attachments: dto.attachments?.map((url, idx) => ({
          id: `att-${Date.now()}-${idx}`,
          name: url.split('/').pop() || 'attachment',
          type: 'file',
          url,
          size: 0,
        })),
      });

      // 4. 调用 LlmProxyService 进行真实 AI 调用
      const model = dto.model || session.modelId || 'deepseek-chat';
      const { stream: _isStream, iterator } = await this.llmProxyService.chatCompletions(
        apiKey,
        {
          model,
          messages,
          stream: true,
        },
      );

      // 5. 解析 OpenAI 格式 SSE 流，转换为桌面端期望的事件格式
      let assistantContent = '';
      let usageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      let buffer = '';

      for await (const chunk of iterator) {
        buffer += chunk;

        // 按行处理 SSE data
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            // 流结束标记，稍后处理
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const finishReason = parsed.choices?.[0]?.finish_reason;

            // 流式文本块
            if (delta?.content) {
              assistantContent += delta.content;
              send('message', { content: delta.content });
            }

            // 提取 usage 信息（某些 provider 在最后一个 chunk 包含 usage）
            if (parsed.usage) {
              usageInfo = {
                promptTokens: parsed.usage.prompt_tokens || 0,
                completionTokens: parsed.usage.completion_tokens || 0,
                totalTokens: parsed.usage.total_tokens || 0,
              };
            }

            // 工具调用
            if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                if (tc.function?.name) {
                  send('tool_call', {
                    id: tc.id || `tc-${Date.now()}`,
                    name: tc.function.name,
                    input: tc.function.arguments ? JSON.parse(tc.function.arguments) : {},
                    output: null,
                    status: 'running',
                  });
                }
              }
            }

            // finish_reason 为 stop 时，表示流结束
            if (finishReason === 'stop') {
              // 继续处理后续可能的 [DONE]
            }
          } catch {
            // 忽略解析错误的行
          }
        }
      }

      // 处理 buffer 残留
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                assistantContent += delta.content;
                send('message', { content: delta.content });
              }
              if (parsed.usage) {
                usageInfo = {
                  promptTokens: parsed.usage.prompt_tokens || 0,
                  completionTokens: parsed.usage.completion_tokens || 0,
                  totalTokens: parsed.usage.total_tokens || 0,
                };
              }
            } catch {
              // 忽略
            }
          }
        }
      }

      // 6. 发送积分信息
      try {
        const account = await this.creditsService.getAccount(user.userId);
        send('credits', {
          amount: usageInfo.totalTokens,
          balance: account.balance,
          frozen: account.frozenBalance,
        });
      } catch {
        // 积分查询失败不影响主流程
      }

      // 7. 保存 AI 回复消息到数据库
      await this.chatService.createMessage(sessionId, user.userId, {
        role: 'assistant',
        content: assistantContent,
        tokenUsage: {
          input: usageInfo.promptTokens,
          output: usageInfo.completionTokens,
          total: usageInfo.totalTokens,
        },
      });

      // 8. 发送完成事件
      send('done', {
        usage: usageInfo,
      });

      res.end();
    } catch (err) {
      const message = (err as Error)?.message || '流式响应错误';
      send('error', { message });
      res.end();
    }
  }
}

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
