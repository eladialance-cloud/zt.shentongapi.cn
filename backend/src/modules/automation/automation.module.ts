import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AutomationTemplateEntity } from "./entities/automation-template.entity";
import { AutomationInstanceEntity } from "./entities/automation-instance.entity";
import { AutomationAuditLogEntity } from "./entities/automation-audit-log.entity";
import { AutomationPolicyEntity } from "./entities/automation-policy.entity";
import { AutomationController } from "./automation.controller";
import { AutomationService } from "./automation.service";
import { AdminAutomationController } from "./admin-automation.controller";
import { AdminAutomationService } from "./admin-automation.service";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { SyncModule } from "../sync/sync.module";

/**
 * 自动化工作台模块（B4/B6 用户侧 + A1-A3 管理侧）
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationTemplateEntity,
      AutomationInstanceEntity,
      AutomationAuditLogEntity,
      AutomationPolicyEntity,
    ]),
    AdminAuthModule,
    SyncModule,
  ],
  controllers: [AutomationController, AdminAutomationController],
  providers: [AutomationService, AdminAutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}