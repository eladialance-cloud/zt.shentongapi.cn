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
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
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
    async streamMessage(_id, dto, _user, res) {
        if (!dto?.content || !dto.content.trim()) {
            throw new common_1.BadRequestException('消息内容不能为空');
        }
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        const echoText = `收到你的消息：「${dto.content}」\n\n这是来自 OpenClaw 引擎的占位流式响应。`;
        const chunks = this.chunkText(echoText, 6);
        const send = (event, data) => {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        try {
            send('tool_call', {
                id: `tc-${Date.now()}`,
                name: 'mock_search',
                input: { query: dto.content },
                output: null,
                duration: 0,
                creditsCost: 0,
                status: 'running',
            });
            await this.sleep(400);
            send('tool_call', {
                id: `tc-${Date.now()}`,
                name: 'mock_search',
                input: { query: dto.content },
                output: { results: ['占位结果 1', '占位结果 2'] },
                duration: 400,
                creditsCost: 2,
                status: 'success',
            });
            for (const chunk of chunks) {
                send('message', { content: chunk });
                await this.sleep(60);
            }
            send('credits', {
                amount: 5,
                balance: 995,
                frozen: 0,
            });
            const promptTokens = Math.ceil(dto.content.length / 2);
            const completionTokens = Math.ceil(echoText.length / 2);
            send('done', {
                usage: {
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                },
            });
            res.end();
        }
        catch (err) {
            send('error', { message: err.message || '流式响应错误' });
            res.end();
        }
    }
    chunkText(text, size) {
        const chunks = [];
        for (let i = 0; i < text.length; i += size) {
            chunks.push(text.slice(i, i + size));
        }
        return chunks;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
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
    (0, common_1.Post)('sessions/:id/messages/stream'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
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