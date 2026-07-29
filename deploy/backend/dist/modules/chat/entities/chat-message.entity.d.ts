export declare class ChatMessageEntity {
    id: number;
    sessionId: number;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: Array<{
        id: string;
        name: string;
        args: Record<string, unknown>;
        result?: string;
    }>;
    tokenUsage?: {
        input: number;
        output: number;
        total: number;
    };
    creditsCost: number;
    attachments?: Array<{
        id: string;
        name: string;
        type: string;
        url: string;
        size: number;
    }>;
    createdAt: Date;
}
