import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChannelEntity } from "../community/entities/channel.entity";
import { PostEntity } from "../community/entities/post.entity";
import { TagEntity } from "../community/entities/tag.entity";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminCommunityController } from "./admin-community.controller";
import { AdminCommunityService } from "./admin-community.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ChannelEntity, PostEntity, TagEntity]),
    AdminAuthModule,
  ],
  controllers: [AdminCommunityController],
  providers: [AdminCommunityService],
  exports: [AdminCommunityService],
})
export class AdminCommunityModule {}
