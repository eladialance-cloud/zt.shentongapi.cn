import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetImportJobEntity } from './entities/asset-import-job.entity';
import { AgentEntity } from '../agent/entities/agent.entity';
import { WorkflowEntity } from '../admin-workflow/entities/workflow.entity';
import { McpCatalogEntity } from '../admin-mcp/entities/mcp-catalog.entity';
import { SkillPackageEntity } from '../skill-store/entities/skill-package.entity';
import { GitHubClientService } from './github-client.service';
import { AdminImportsService } from './admin-imports.service';
import { AdminImportsController } from './admin-imports.controller';
import { AdminClassifyModule } from '../admin-classify/admin-classify.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssetImportJobEntity, AgentEntity, WorkflowEntity, McpCatalogEntity, SkillPackageEntity]),
    AdminClassifyModule,
  ],
  controllers: [AdminImportsController],
  providers: [GitHubClientService, AdminImportsService],
  exports: [AdminImportsService],
})
export class AdminImportsModule {}
