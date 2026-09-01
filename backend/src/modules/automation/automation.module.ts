import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AutomationTemplateEntity } from "./entities/automation-template.entity";
import { AutomationInstanceEntity } from "./entities/automation-instance.entity";
import { AutomationAuditLogEntity } from "./entities/automation-audit-log.entity";
import { AutomationController } from "./automation.controller";
import { AutomationService } from "./automation.service";

/**
 * 自动化工作台 - 场景模板/实例/审计模块（方案 B4/B6）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationTemplateEntity,
      AutomationInstanceEntity,
      AutomationAuditLogEntity,
    ]),
  ],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}