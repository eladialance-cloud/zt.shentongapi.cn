import type { Response } from 'express';
import { ChatService } from '../services/chat.service';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
declare class CreateSessionDto {
    agentId?: number;
    title?: string;
}
declare class SendMessageStreamDto {
    content: string;
    attachments?: Array<{
        id: string;
        name: string;
        type: string;
        url: string;
        size: number;
    }>;
}
export declare class ChatController {
    private readonly chatService;
    constructor(chatService: ChatService);
    health(): {
        status: string;
        module: string;
    };
    createSession(dto: CreateSessionDto, user: ICurrentUser): Promise<import("../entities/chat-session.entity").ChatSessionEntity>;
    getSessions(user: ICurrentUser, page?: string, pageSize?: string): Promise<{
        list: import("../entities/chat-session.entity").ChatSessionEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getMessages(id: string, user: ICurrentUser, page?: string, pageSize?: string): Promise<{
        list: import("../entities/chat-message.entity").ChatMessageEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    deleteSession(id: string, user: ICurrentUser): Promise<{
        success: boolean;
    }>;
    streamMessage(id: string, dto: SendMessageStreamDto, user: ICurrentUser, res: Response): Promise<void>;
}
export {};
