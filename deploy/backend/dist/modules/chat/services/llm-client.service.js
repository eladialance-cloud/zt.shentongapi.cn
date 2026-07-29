"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LlmClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmClientService = void 0;
const common_1 = require("@nestjs/common");
const secret_util_1 = require("../../../common/utils/secret.util");
const DEFAULT_ENDPOINTS = {
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3',
};
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 3000];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let LlmClientService = class LlmClientService {
    static { LlmClientService_1 = this; }
    logger = new common_1.Logger(LlmClientService_1.name);
    circuitState = 'closed';
    failureCount = 0;
    lastFailureTime = 0;
    static FAILURE_THRESHOLD = 5;
    static RECOVERY_TIMEOUT_MS = 30000;
    checkCircuit() {
        if (this.circuitState === 'open') {
            const elapsed = Date.now() - this.lastFailureTime;
            if (elapsed >= LlmClientService_1.RECOVERY_TIMEOUT_MS) {
                this.circuitState = 'half-open';
                this.logger.warn('Circuit breaker entering half-open state');
            }
            else {
                throw new common_1.ServiceUnavailableException(`LLM service circuit breaker is open. Retry after ${Math.ceil((LlmClientService_1.RECOVERY_TIMEOUT_MS - elapsed) / 1000)}s`);
            }
        }
    }
    recordSuccess() {
        this.failureCount = 0;
        if (this.circuitState === 'half-open') {
            this.circuitState = 'closed';
            this.logger.log('Circuit breaker closed (recovered)');
        }
    }
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= LlmClientService_1.FAILURE_THRESHOLD) {
            this.circuitState = 'open';
            this.logger.error(`Circuit breaker opened after ${this.failureCount} consecutive failures`);
        }
    }
    async streamChat(options, callbacks) {
        const provider = options.provider || this.getProviderFromModelId(options.model);
        const endpoint = options.endpoint ||
            DEFAULT_ENDPOINTS[provider] ||
            DEFAULT_ENDPOINTS['openai'];
        const url = `${endpoint}/chat/completions`;
        const body = {
            model: options.model,
            stream: true,
            stream_options: { include_usage: true },
            messages: [
                { role: 'system', content: options.systemPrompt },
                ...options.messages,
            ],
        };
        if (options.tools && options.tools.length > 0) {
            body['tools'] = options.tools;
            body['tool_choice'] = 'auto';
        }
        this.logger.debug(`LLM streamChat 开始: model=${options.model}, provider=${provider}, key=${(0, secret_util_1.maskApiKey)(options.apiKey)}`);
        this.checkCircuit();
        let response;
        let lastError = null;
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
            }
            catch (err) {
                if (attempt < MAX_RETRIES) {
                    lastError = err;
                    this.logger.warn(`LLM API request failed: ${err.message}, retrying in ${RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await sleep(RETRY_DELAYS_MS[attempt]);
                    continue;
                }
                this.recordFailure();
                throw err;
            }
            if (!response.ok) {
                const errorText = await response.text();
                const error = new Error(`LLM API error ${response.status}: ${errorText}`);
                if (!this.shouldRetry(response.status)) {
                    throw error;
                }
                lastError = error;
                if (attempt < MAX_RETRIES) {
                    this.logger.warn(`LLM API ${response.status}, retrying in ${RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await sleep(RETRY_DELAYS_MS[attempt]);
                    continue;
                }
                this.recordFailure();
                throw error;
            }
            lastError = null;
            this.recordSuccess();
            break;
        }
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
        const pendingToolCalls = [];
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: '))
                        continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]')
                        continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices?.[0]?.delta?.content) {
                            const chunk = parsed.choices[0].delta.content;
                            fullResponse += chunk;
                            callbacks.onMessage(chunk);
                        }
                        const deltaToolCalls = parsed.choices?.[0]?.delta?.tool_calls;
                        if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
                            for (const tc of deltaToolCalls) {
                                const idx = tc.index ?? 0;
                                if (!pendingToolCalls[idx]) {
                                    pendingToolCalls[idx] = { id: '', name: '', args: '' };
                                }
                                if (tc.id)
                                    pendingToolCalls[idx].id = tc.id;
                                if (tc.function?.name)
                                    pendingToolCalls[idx].name += tc.function.name;
                                if (tc.function?.arguments)
                                    pendingToolCalls[idx].args += tc.function.arguments;
                            }
                        }
                        if (parsed.usage) {
                            usage.input = parsed.usage.prompt_tokens || 0;
                            usage.output = parsed.usage.completion_tokens || 0;
                            usage.total = parsed.usage.total_tokens || 0;
                        }
                    }
                    catch {
                    }
                }
            }
            if (buffer.trim()) {
                const trimmed = buffer.trim();
                if (trimmed.startsWith('data: ')) {
                    const data = trimmed.slice(6);
                    if (data !== '[DONE]') {
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.choices?.[0]?.delta?.content) {
                                const chunk = parsed.choices[0].delta.content;
                                fullResponse += chunk;
                                callbacks.onMessage(chunk);
                            }
                            const deltaToolCalls = parsed.choices?.[0]?.delta?.tool_calls;
                            if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
                                for (const tc of deltaToolCalls) {
                                    const idx = tc.index ?? 0;
                                    if (!pendingToolCalls[idx]) {
                                        pendingToolCalls[idx] = { id: '', name: '', args: '' };
                                    }
                                    if (tc.id)
                                        pendingToolCalls[idx].id = tc.id;
                                    if (tc.function?.name)
                                        pendingToolCalls[idx].name += tc.function.name;
                                    if (tc.function?.arguments)
                                        pendingToolCalls[idx].args += tc.function.arguments;
                                }
                            }
                            if (parsed.usage) {
                                usage.input = parsed.usage.prompt_tokens || 0;
                                usage.output = parsed.usage.completion_tokens || 0;
                                usage.total = parsed.usage.total_tokens || 0;
                            }
                        }
                        catch {
                        }
                    }
                }
            }
        }
        catch (err) {
            await callbacks.onError(err);
            throw err;
        }
        finally {
            await reader.cancel();
        }
        const validToolCalls = pendingToolCalls.filter((tc) => tc.name);
        if (validToolCalls.length > 0 && options.toolExecutor) {
            this.logger.debug(`检测到 ${validToolCalls.length} 个 tool_calls，开始执行`);
            if (callbacks.onToolCall) {
                for (const tc of validToolCalls) {
                    callbacks.onToolCall({
                        id: tc.id,
                        name: tc.name,
                        args: tc.args,
                    });
                }
            }
            const toolResults = [];
            for (const tc of validToolCalls) {
                try {
                    let parsedArgs = {};
                    try {
                        parsedArgs = tc.args ? JSON.parse(tc.args) : {};
                    }
                    catch {
                        this.logger.warn(`工具 ${tc.name} 参数解析失败: ${tc.args}`);
                    }
                    const result = await options.toolExecutor(tc.name, parsedArgs);
                    toolResults.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: JSON.stringify(result),
                    });
                    this.logger.debug(`工具 ${tc.name} 执行成功`);
                }
                catch (err) {
                    toolResults.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: JSON.stringify({ error: err.message }),
                    });
                    this.logger.warn(`工具 ${tc.name} 执行失败: ${err.message}`);
                }
            }
            const assistantMsg = {
                role: 'assistant',
                content: fullResponse || null,
                tool_calls: validToolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: tc.args },
                })),
            };
            const followUpMessages = [
                ...options.messages,
                assistantMsg,
                ...toolResults,
            ];
            return this.streamChat({
                ...options,
                messages: followUpMessages,
                tools: undefined,
                toolExecutor: undefined,
            }, callbacks);
        }
        await callbacks.onDone(usage, fullResponse);
        return { fullResponse, usage };
    }
    shouldRetry(status) {
        return status === 429 || (status >= 500 && status < 600);
    }
    getProviderFromModelId(modelId) {
        if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) {
            return 'openai';
        }
        if (modelId.startsWith('claude')) {
            throw new common_1.BadRequestException(`Claude models are not yet supported. Model: ${modelId}`);
        }
        if (modelId.startsWith('deepseek'))
            return 'deepseek';
        if (modelId.startsWith('qwen'))
            return 'qwen';
        if (modelId.startsWith('doubao'))
            return 'doubao';
        return 'openai';
    }
};
exports.LlmClientService = LlmClientService;
exports.LlmClientService = LlmClientService = LlmClientService_1 = __decorate([
    (0, common_1.Injectable)()
], LlmClientService);
//# sourceMappingURL=llm-client.service.js.map