import { Repository } from 'typeorm';
import { ChatSessionEntity } from '../entities/chat-session.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';
import { AgentEntity } from '../../agent/entities/agent.entity';
import { CreditsService } from '../../credits/services/credits.service';
import { ApiKeyPoolService } from '../../api-key-pool/services/api-key-pool.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { LlmClientService } from './llm-client.service';
import { McpService } from '../../mcp/services/mcp.service';
import { OpenClawService } from '../../openclaw/services/openclaw.service';
export interface SendMessageOptions {
    sessionId: number;
    content: string;
    userId: number;
    attachments?: Array<{
        id: string;
        name: string;
        type: string;
        url: string;
        size: number;
    }>;
}
export interface StreamCallbacks {
    onMessage: (chunk: string) => void;
    onToolCall?: (toolCall: unknown) => void;
    onCredits?: (credits: {
        amount: number;
        balance: number;
    }) => void;
    onDone: (usage: {
        input: number;
        output: number;
        total: number;
    }) => void;
    onError: (error: Error) => void;
}
export declare class ChatService {
    private sessionRepo;
    private messageRepo;
    private agentRepo;
    private creditsService;
    private apiKeyPoolService;
    private encryptionService;
    private llmClient;
    private mcpService;
    private openclawService;
    private readonly logger;
    constructor(sessionRepo: Repository<ChatSessionEntity>, messageRepo: Repository<ChatMessageEntity>, agentRepo: Repository<AgentEntity>, creditsService: CreditsService, apiKeyPoolService: ApiKeyPoolService, encryptionService: EncryptionService, llmClient: LlmClientService, mcpService: McpService, openclawService: OpenClawService);
    createSession(userId: number, agentId: number | null, title?: string): Promise<ChatSessionEntity>;
    getUserSessions(userId: number, page?: number, pageSize?: number): Promise<{
        list: ChatSessionEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getSessionMessages(sessionId: number, userId: number, page?: number, pageSize?: number): Promise<{
        list: ChatMessageEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    deleteSession(sessionId: number, userId: number): Promise<void>;
    streamMessage(options: SendMessageOptions, callbacks: StreamCallbacks): Promise<void>;
    private estimateCost;
    private calculateActualCost;
    private getContextMessages;
    health(): {
        status: string;
        module: string;
    };
}
