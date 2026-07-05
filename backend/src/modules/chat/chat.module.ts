import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroupEntity } from './entities/chat-group.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ChatSessionEntity } from './entities/chat-session.entity';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './services/chat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatGroupEntity,
      ChatMessageEntity,
      ChatSessionEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
