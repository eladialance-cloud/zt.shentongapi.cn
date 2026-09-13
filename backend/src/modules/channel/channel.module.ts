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
import { WecomAdapter } from "./adapters/wecom.adapter";
import { DingtalkBotAdapter } from "./adapters/dingtalk-bot.adapter";
import { TelegramBotAdapter } from "./adapters/telegram-bot.adapter";
import { WecomBotAdapter } from "./adapters/wecom-bot.adapter";
import { QqBotAdapter } from "./adapters/qq-bot.adapter";
import { ChannelAdapterRegistry } from "./channel-adapter.registry";
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
  providers: [
    ChannelService,
    PublishService,
    FeishuBotAdapter,
    WechatMpAdapter,
    WecomAdapter,
    DingtalkBotAdapter,
    TelegramBotAdapter,
    WecomBotAdapter,
    QqBotAdapter,
    ChannelAdapterRegistry,
  ],
  exports: [
    ChannelService,
    PublishService,
    FeishuBotAdapter,
    WechatMpAdapter,
    WecomAdapter,
    DingtalkBotAdapter,
    TelegramBotAdapter,
    WecomBotAdapter,
    QqBotAdapter,
    ChannelAdapterRegistry,
  ],
})
export class ChannelModule {}
