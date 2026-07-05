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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMessageEntity = void 0;
const typeorm_1 = require("typeorm");
let ChatMessageEntity = class ChatMessageEntity {
    id;
    sessionId;
    role;
    content;
    toolCalls;
    tokenUsage;
    creditsCost;
    attachments;
    createdAt;
};
exports.ChatMessageEntity = ChatMessageEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)({ type: 'bigint', name: 'id' }),
    __metadata("design:type", Number)
], ChatMessageEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_chat_messages_session_id'),
    (0, typeorm_1.Column)({ name: 'session_id', type: 'bigint' }),
    __metadata("design:type", Number)
], ChatMessageEntity.prototype, "sessionId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ['user', 'assistant', 'system', 'tool'],
    }),
    __metadata("design:type", String)
], ChatMessageEntity.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'mediumtext' }),
    __metadata("design:type", String)
], ChatMessageEntity.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'tool_calls', type: 'json', nullable: true }),
    __metadata("design:type", Array)
], ChatMessageEntity.prototype, "toolCalls", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'token_usage', type: 'json', nullable: true }),
    __metadata("design:type", Object)
], ChatMessageEntity.prototype, "tokenUsage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'credits_cost', type: 'int', default: 0 }),
    __metadata("design:type", Number)
], ChatMessageEntity.prototype, "creditsCost", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'json', nullable: true }),
    __metadata("design:type", Array)
], ChatMessageEntity.prototype, "attachments", void 0);
__decorate([
    (0, typeorm_1.Index)('idx_chat_messages_created_at'),
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], ChatMessageEntity.prototype, "createdAt", void 0);
exports.ChatMessageEntity = ChatMessageEntity = __decorate([
    (0, typeorm_1.Entity)('chat_messages')
], ChatMessageEntity);
//# sourceMappingURL=chat-message.entity.js.map