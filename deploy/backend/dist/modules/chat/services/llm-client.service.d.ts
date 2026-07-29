export interface StreamChatOptions {
    model: string;
    apiKey: string;
    endpoint?: string;
    provider?: string;
    systemPrompt: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }>;
    toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}
export interface StreamChatCallbacks {
    onMessage: (chunk: string) => void;
    onToolCall?: (toolCall: {
        id: string;
        name: string;
        args: string;
    }) => void;
    onDone: (usage: {
        input: number;
        output: number;
        total: number;
    }, fullResponse: string) => void;
    onError: (error: Error) => void;
}
export interface StreamChatResult {
    fullResponse: string;
    usage: {
        input: number;
        output: number;
        total: number;
    };
}
export declare class LlmClientService {
    private readonly logger;
    private circuitState;
    private failureCount;
    private lastFailureTime;
    private static readonly FAILURE_THRESHOLD;
    private static readonly RECOVERY_TIMEOUT_MS;
    private checkCircuit;
    private recordSuccess;
    private recordFailure;
    streamChat(options: StreamChatOptions, callbacks: StreamChatCallbacks): Promise<StreamChatResult>;
    private shouldRetry;
    getProviderFromModelId(modelId: string): string;
}
