import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from './entities/chat-group.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ChatSessionEntity } from './entities/chat-session.entity';
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
 * - ChatService: 会话和消息 CRUD
 * - LlmProxyService: LLM 代理调用（积分冻结/结算由其内部处理）
 * - LlmClientService: LLM 流式调用客户端
 * - CreditsModule 提供 CreditsService（ChatController 用于查询余额发送 credits 事件）
 * - ApiKeyPoolModule 提供密钥池管理
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatGroupEntity,
      ChatMessageEntity,
      ChatSessionEntity,
      UserEntity,
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
