import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from './entities/chat-group.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ChatSessionEntity } from './entities/chat-session.entity';
import { AgentEntity } from '../agent/entities/agent.entity';
import { UserEntity } from '../user/entities/user.entity';
import { ChatController } from './controllers/chat.controller';
import { LlmProxyController } from './controllers/llm-proxy.controller';
import { ChatService } from './services/chat.service';
import { LlmProxyService } from './services/llm-proxy.service';
import { LlmClientService } from './services/llm-client.service';
import { CommonModule } from '../../common/common.module';
import { CreditsModule } from '../credits/credits.module';
import { ApiKeyPoolModule } from '../api-key-pool/api-key-pool.module';

/**
 * Chat 模块
 * - ChatService: 会话和消息 CRUD + 多运行时路由
 * - LlmProxyService: LLM 代理调用
 * - LlmClientService: LLM 流式调用客户端
 *
 * 路由策略 (v0.6.0):
 *   用户消息 → runtimeType=openclaw → OpenClaw 远程Agent
 *            → runtimeType=hermes   → Hermes 本地Agent
 *            → 默认                → LLM 直连
 *
 * 注: Hermes/OpenClaw/MCP/Task/Codex 等服务通过 NestJS 全局 DI 解析，
 *     不在 imports 中引入，避免循环依赖导致 502。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatGroupEntity,
      ChatMessageEntity,
      ChatSessionEntity,
      UserEntity,
      AgentEntity,
    ]),
    CommonModule,
    CreditsModule,
    ApiKeyPoolModule,
  ],
  controllers: [ChatController, LlmProxyController],
  providers: [ChatService, LlmProxyService, LlmClientService],
  exports: [ChatService, LlmProxyService, LlmClientService],
})
export class ChatModule {}
