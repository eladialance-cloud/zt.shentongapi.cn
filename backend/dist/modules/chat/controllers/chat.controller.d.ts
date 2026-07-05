import type { Response } from 'express';
import { ChatService } from '../services/chat.service';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
declare class SendMessageStreamDto {
    content: string;
    attachments?: string[];
}
export declare class ChatController {
    private readonly chatService;
    constructor(chatService: ChatService);
    health(): {
        status: string;
        module: string;
    };
    streamMessage(_id: string, dto: SendMessageStreamDto, _user: ICurrentUser, res: Response): Promise<void>;
    private chunkText;
    private sleep;
}
export {};
