import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentEntity } from '../agent/entities/agent.entity';
import { AgentReviewEntity } from '../agent/entities/agent-review.entity';
import { UserEntity } from '../user/entities/user.entity';
import { AgentCategoryEntity } from './entities/agent-category.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminAgentController } from './admin-agent.controller';
import { AdminAgentService } from './admin-agent.service';

/**
 * 管理端 Agent 市场模块
 * 数据合同真源：Task 20 - Agent 市场管理
 *
 * 覆盖前端 admin-agent-api.ts 的全部端点：
 *   - /admin/agents                    Agent CRUD / 上下架 / 审核 / 导入
 *   - /admin/agents/categories         分类管理
 *
 * 导入 AdminAuthModule 以复用 AdminGuard。
 * 复用现有 AgentEntity / AgentReviewEntity，仅新增 AgentCategoryEntity（分类显示名）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentEntity,
      AgentReviewEntity,
      UserEntity,
      AgentCategoryEntity,
    ]),
    AdminAuthModule,
  ],
  controllers: [AdminAgentController],
  providers: [AdminAgentService],
  exports: [AdminAgentService],
})
export class AdminAgentModule {}
