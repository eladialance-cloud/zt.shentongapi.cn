import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { maskApiKey } from '../../../common/utils/secret.util';

export interface StreamChatOptions {
  model: string;
  apiKey: string;
  endpoint?: string;
  provider?: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolExecutor?: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}

export interface StreamChatCallbacks {
  onMessage: (chunk: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; args: string }) => void;
  onDone: (
    usage: { input: number; output: number; total: number },
    fullResponse: string,
  ) => void;
  onError: (error: Error) => void;
}

export interface StreamChatResult {
  fullResponse: string;
  usage: { input: number; output: number; total: number };
}

/** 各 provider 默认 OpenAI 兼容端点 */
const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  // 移除 anthropic：不支持 OpenAI 兼容的 /chat/completions 接口
};

/** 重试配置：最多 2 次重试，间隔 1s/3s（指数退避） */
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 3000];

/** sleep 工具函数 */
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * LLM 流式调用客户端
 * 兼容 OpenAI / DeepSeek / 通义千问 / 豆包等 OpenAI 兼容接口
 */
@Injectable()
export class LlmClientService {
  private readonly logger = new Logger(LlmClientService.name);

  // 简易熔断器
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private static readonly FAILURE_THRESHOLD = 5;
  private static readonly RECOVERY_TIMEOUT_MS = 30000; // 30s

  private checkCircuit(): void {
    if (this.circuitState === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= LlmClientService.RECOVERY_TIMEOUT_MS) {
        this.circuitState = 'half-open';
        this.logger.warn('Circuit breaker entering half-open state');
      } else {
        throw new ServiceUnavailableException(
          `LLM service circuit breaker is open. Retry after ${Math.ceil(
            (LlmClientService.RECOVERY_TIMEOUT_MS - elapsed) / 1000,
          )}s`,
        );
      }
    }
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    if (this.circuitState === 'half-open') {
      this.circuitState = 'closed';
      this.logger.log('Circuit breaker closed (recovered)');
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= LlmClientService.FAILURE_THRESHOLD) {
      this.circuitState = 'open';
      this.logger.error(
        `Circuit breaker opened after ${this.failureCount} consecutive failures`,
      );
    }
  }

  async streamChat(
    options: StreamChatOptions,
    callbacks: StreamChatCallbacks,
    maxDepth: number = 3,
  ): Promise<StreamChatResult> {
    const provider =
      options.provider || this.getProviderFromModelId(options.model);
    const endpoint =
      options.endpoint ||
      DEFAULT_ENDPOINTS[provider] ||
      DEFAULT_ENDPOINTS['openai'];
    const url = `${endpoint}/chat/completions`;

    const body: Record<string, unknown> = {
      model: options.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: options.systemPrompt },
        ...options.messages,
      ],
    };

    // 如果有工具定义，加入 tools 参数
    if (options.tools && options.tools.length > 0) {
      body['tools'] = options.tools;
      body['tool_choice'] = 'auto';
    }

    this.logger.debug(
      `LLM streamChat 开始: model=${options.model}, provider=${provider}, key=${maskApiKey(options.apiKey)}`,
    );

    // 熔断器检查（重试循环之前）
    this.checkCircuit();

    let response!: Response;
    let lastError: Error | null = null;

    // 重试循环：仅覆盖 fetch + response.ok 校验（流式读取阶段不重试）
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        });
      } catch (err) {
        // 网络错误/超时也重试
        if (attempt < MAX_RETRIES) {
          lastError = err as Error;
          this.logger.warn(
            `LLM API request failed: ${(err as Error).message}, retrying in ${RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        // 重试耗尽，记录熔断器失败
        this.recordFailure();
        throw err;
      }

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`LLM API error ${response.status}: ${errorText}`);

        // 4xx（除 429）不重试，直接抛出
        if (!this.shouldRetry(response.status)) {
          throw error;
        }

        // 429/5xx 可重试
        lastError = error;
        if (attempt < MAX_RETRIES) {
          this.logger.warn(
            `LLM API ${response.status}, retrying in ${RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        // 重试次数耗尽，记录熔断器失败（429/5xx 视为服务故障）
        this.recordFailure();
        throw error;
      }

      // 成功，跳出重试循环
      lastError = null;
      this.recordSuccess();
      break;
    }

    // 此处 response 一定存在且 ok（否则上面已 throw）
    if (lastError) {
      throw lastError;
    }

    if (!response.body) {
      throw new Error('LLM API returned no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    const usage = { input: 0, output: 0, total: 0 };
    let buffer = '';
    const pendingToolCalls: Array<{ id: string; name: string; args: string }> = [];

    /** 解析单行 SSE data */
    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) return;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          fullResponse += delta.content;
          callbacks.onMessage(delta.content);
        }
        // 收集流式 tool_calls
        if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!pendingToolCalls[idx]) pendingToolCalls[idx] = { id: '', name: '', args: '' };
            if (tc.id) pendingToolCalls[idx].id = tc.id;
            if (tc.function?.name) pendingToolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) pendingToolCalls[idx].args += tc.function.arguments;
          }
        }
        if (parsed.usage) {
          usage.input = parsed.usage.prompt_tokens || 0;
          usage.output = parsed.usage.completion_tokens || 0;
          usage.total = parsed.usage.total_tokens || 0;
        }
      } catch {
        // 忽略解析错误的行
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) processLine(line);
      }
      // 处理 buffer 残留行
      if (buffer.trim()) processLine(buffer);
    } catch (err) {
      await callbacks.onError(err as Error);
      throw err;
    } finally {
      await reader.cancel();
    }

    // 如果有 tool_calls 且提供了 toolExecutor，执行工具并重新调用 LLM
    const validToolCalls = pendingToolCalls.filter((tc) => tc.name);
    if (validToolCalls.length > 0 && options.toolExecutor) {
      this.logger.debug(`检测到 ${validToolCalls.length} 个 tool_calls，开始执行`);

      // 通知调用方有工具调用
      if (callbacks.onToolCall) {
        for (const tc of validToolCalls) {
          callbacks.onToolCall({
            id: tc.id,
            name: tc.name,
            args: tc.args,
          });
        }
      }

      // 执行所有工具调用
      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];
      for (const tc of validToolCalls) {
        try {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = tc.args ? JSON.parse(tc.args) : {};
          } catch {
            this.logger.warn(`工具 ${tc.name} 参数解析失败: ${tc.args}`);
          }
          const result = await options.toolExecutor(tc.name, parsedArgs);
          toolResults.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
          this.logger.debug(`工具 ${tc.name} 执行成功`);
        } catch (err) {
          toolResults.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: (err as Error).message }),
          });
          this.logger.warn(`工具 ${tc.name} 执行失败: ${(err as Error).message}`);
        }
      }

      // 构造 assistant 消息（包含 tool_calls）和工具结果，重新调用 LLM
      const assistantMsg = {
        role: 'assistant',
        content: fullResponse || null,
        tool_calls: validToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.args },
        })),
      };

      // 递归调用（不带 tools 参数，让 LLM 基于工具结果生成最终回复）
      // 深度限制检查
      if (maxDepth <= 0) {
        throw new BadRequestException(
          'LLM 工具调用递归深度超限（maxDepth=0），可能存在无限工具调用循环',
        );
      }

      const followUpMessages = [
        ...options.messages,
        assistantMsg as unknown as { role: string; content: string },
        ...toolResults as unknown as Array<{ role: string; content: string }>,
      ];

      return this.streamChat(
        {
          ...options,
          messages: followUpMessages,
          tools: undefined, // 不再传 tools，避免无限循环
          toolExecutor: undefined,
        },
        callbacks,
        maxDepth - 1,
      );
    }

    await callbacks.onDone(usage, fullResponse);
    return { fullResponse, usage };
  }

  /** 判断是否应重试：429 或 5xx 可重试，4xx（除 429）不重试 */
  private shouldRetry(status: number): boolean {
    return status === 429 || (status >= 500 && status < 600);
  }

  /** 从 modelId 提取 provider */
  getProviderFromModelId(modelId: string): string {
    if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) {
      return 'openai';
    }
    if (modelId.startsWith('claude')) {
      throw new BadRequestException(
        `Claude models are not yet supported. Model: ${modelId}`,
      );
    }
    if (modelId.startsWith('deepseek')) return 'deepseek';
    if (modelId.startsWith('qwen')) return 'qwen';
    if (modelId.startsWith('doubao')) return 'doubao';
    return 'openai';
  }
}
