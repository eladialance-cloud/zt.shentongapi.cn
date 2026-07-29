import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentTaskEntity } from './entities/agent-task.entity';
import { TaskOutputItemEntity } from './entities/task-output-item.entity';
import { TaskController } from './controllers/task.controller';
import { AdminTaskController } from './controllers/admin-task.controller';
import { TaskService } from './services/task.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

/**
 * 任务模块
 * 提供通用任务管理功能（创建、查询、取消、输出项管理）
 * AdminTaskController 使用 AdminGuard，需导入 AdminAuthModule
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentTaskEntity, TaskOutputItemEntity]),
    AdminAuthModule,
  ],
  controllers: [TaskController, AdminTaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
