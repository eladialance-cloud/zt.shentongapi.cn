import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelEntity } from '../model/entities/model.entity';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { AgentEntity } from '../agent/entities/agent.entity';
import { WorkflowEntity } from '../admin-workflow/entities/workflow.entity';
import { McpCatalogEntity } from '../admin-mcp/entities/mcp-catalog.entity';
import { SkillPackageEntity } from '../skill-store/entities/skill-package.entity';
import { PluginEntity } from '../plugin/entities/plugin.entity';
import { CommonModule } from '../../common/common.module';
import { AiClassifyService } from './ai-classify.service';
import { AdminClassifyController } from './admin-classify.controller';

/**
 * AI 自动分类模块：六类资产统一智能分类层（Task 5）
 * - AiClassifyService：复用管理后台全局中转 + 默认文本模型调用 chat/completions
 * - POST /admin/classify：手动重新分类触发点
 * - 导出 AiClassifyService 供 AdminImportsModule 与五个资产模块接入
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModelEntity,
      ModelProviderEntity,
      AgentEntity,
      WorkflowEntity,
      McpCatalogEntity,
      SkillPackageEntity,
      PluginEntity,
    ]),
    CommonModule,
  ],
  controllers: [AdminClassifyController],
  providers: [AiClassifyService],
  exports: [AiClassifyService],
})
export class AdminClassifyModule {}
