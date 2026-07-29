"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const chat_service_1 = require("../services/chat.service");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
class CreateSessionDto {
    agentId;
    title;
}
class SendMessageStreamDto {
    content;
    attachments;
}
let ChatController = class ChatController {
    chatService;
    constructor(chatService) {
        this.chatService = chatService;
    }
    health() {
        return this.chatService.health();
    }
    async createSession(dto, user) {
        return this.chatService.createSession(user.userId, dto.agentId ?? null, dto.title);
    }
    async getSessions(user, page = '1', pageSize = '20') {
        return this.chatService.getUserSessions(user.userId, Number(page), Number(pageSize));
    }
    async getMessages(id, user, page = '1', pageSize = '50') {
        return this.chatService.getSessionMessages(Number(id), user.userId, Number(page), Number(pageSize));
    }
    async deleteSession(id, user) {
        await this.chatService.deleteSession(Number(id), user.userId);
        return { success: true };
    }
    async streamMessage(id, dto, user, res) {
        if (!dto?.content?.trim()) {
            throw new common_1.BadRequestException('消息内容不能为空');
        }
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        let closed = false;
        const abortController = new AbortController();
        const send = (event, data) => {
            if (closed)
                return;
            try {
                res.write(`event: ${event}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
            catch {
                closed = true;
            }
        };
        res.on('close', () => {
            closed = true;
            abortController.abort();
        });
        await this.chatService.streamMessage({
            sessionId: Number(id),
            content: dto.content,
            userId: user.userId,
            attachments: dto.attachments,
            abortSignal: abortController.signal,
        }, {
            onMessage: (chunk) => send('message', { content: chunk }),
            onToolCall: (tc) => send('tool_call', tc),
            onCredits: (c) => send('credits', c),
            onDone: (usage) => {
                send('done', { usage });
                if (!closed) {
                    closed = true;
                    res.end();
                }
            },
            onError: (error) => {
                send('error', { message: error.message || '流式响应错误' });
                if (!closed) {
                    closed = true;
                    res.end();
                }
            },
        });
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)('health'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '健康检查' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ChatController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('sessions'),
    (0, swagger_1.ApiOperation)({ summary: '创建会话' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateSessionDto, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "createSession", null);
__decorate([
    (0, common_1.Get)('sessions'),
    (0, swagger_1.ApiOperation)({ summary: '会话列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getSessions", null);
__decorate([
    (0, common_1.Get)('sessions/:id/messages'),
    (0, swagger_1.ApiOperation)({ summary: '会话历史消息' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Delete)('sessions/:id'),
    (0, swagger_1.ApiOperation)({ summary: '删除会话' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "deleteSession", null);
__decorate([
    (0, common_1.Post)('sessions/:id/messages/stream'),
    (0, swagger_1.ApiOperation)({ summary: 'SSE 流式发送消息' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, SendMessageStreamDto, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "streamMessage", null);
exports.ChatController = ChatController = __decorate([
    (0, swagger_1.ApiTags)('聊天'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('chat'),
    __metadata("design:paramtypes", [chat_service_1.ChatService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map