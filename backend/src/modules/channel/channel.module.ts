import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ChannelEntity } from "./entities/channel.entity";
import { ChannelMessageEntity } from "./entities/channel-message.entity";
import { PublishPlanEntity } from "./entities/publish-plan.entity";
import { ChannelController } from "./controllers/channel.controller";
import { ChannelService } from "./services/channel.service";
import { PublishService } from "./services/publish.service";
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
  providers: [ChannelService, PublishService],
  exports: [ChannelService, PublishService],
})
export class ChannelModule {}
