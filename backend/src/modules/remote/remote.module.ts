import { Module } from "@nestjs/common";
import { RemoteController } from "./remote.controller";
import { RemoteService } from "./remote.service";
import { SyncModule } from "../sync/sync.module";
import { ChannelModule } from "../channel/channel.module";
import { AutomationModule } from "../automation/automation.module";

/**
 * 自动化工作台 - 远程控制模块（阶段1：飞书 → 场景/命令路由 → 设备执行 → 结果回传）
 * 方案文档: 深瞳AI自动化工作台建设方案（代码内置版）B1/B2/B5/B7-lite/B6
 */
@Module({
  imports: [SyncModule, ChannelModule, AutomationModule],
  controllers: [RemoteController],
  providers: [RemoteService],
  exports: [RemoteService],
})
export class RemoteModule {}