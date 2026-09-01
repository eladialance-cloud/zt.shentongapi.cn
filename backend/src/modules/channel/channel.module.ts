import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChannelEntity } from "./entities/channel.entity";
import { ChannelMessageEntity } from "./entities/channel-message.entity";
import { PublishPlanEntity } from "./entities/publish-plan.entity";
import { ChannelController } from "./controllers/channel.controller";
import { ChannelService } from "./services/channel.service";
import { PublishService } from "./services/publish.service";
import { FeishuBotAdapter } from "./adapters/feishu-bot.adapter";
import { WechatMpAdapter } from "./adapters/wechat-mp.adapter";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChannelEntity,
      ChannelMessageEntity,
      PublishPlanEntity,
    ]),
    CommonModule,
  ],
  controllers: [ChannelController],
  providers: [ChannelService, PublishService, FeishuBotAdapter, WechatMpAdapter],
  exports: [ChannelService, PublishService, FeishuBotAdapter, WechatMpAdapter],
})
export class ChannelModule {}
