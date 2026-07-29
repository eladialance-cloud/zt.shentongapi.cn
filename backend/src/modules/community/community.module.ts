import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunityService } from './community.service';
import { CommunityChannelController } from './controllers/community-channel.controller';
import { CommunityPostController } from './controllers/community-post.controller';
import { CommunityReplyController } from './controllers/community-reply.controller';
import { CommunityInteractionController } from './controllers/community-interaction.controller';
import { CommunityUserController } from './controllers/community-user.controller';
import { ChannelEntity } from './entities/channel.entity';
import { PostEntity } from './entities/post.entity';
import { ReplyEntity } from './entities/reply.entity';
import { VoteEntity } from './entities/vote.entity';
import { BookmarkEntity } from './entities/bookmark.entity';
import { TagEntity } from './entities/tag.entity';
import { PostTagEntity } from './entities/post-tag.entity';
import { UserProfileEntity } from './entities/user-profile.entity';

/**
 * 社区模块
 * 数据合同真源：Community 模块 - 社区核心模块
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChannelEntity,
      PostEntity,
      ReplyEntity,
      VoteEntity,
      BookmarkEntity,
      TagEntity,
      PostTagEntity,
      UserProfileEntity,
    ]),
  ],
  controllers: [
    CommunityChannelController,
    CommunityPostController,
    CommunityReplyController,
    CommunityInteractionController,
    CommunityUserController,
  ],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
