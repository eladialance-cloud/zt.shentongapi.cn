import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelEntity } from '../model/entities/model.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminModelController } from './admin-model.controller';
import { AdminModelService } from './admin-model.service';

/**
 * 管理端大模型配置模块
 * 数据合同真源：Task 23 - 大模型配置
 *
 * 覆盖前端 admin-model-api.ts 的全部端点：
 *   - /admin/models                模型 CRUD / 启用禁用 / 测试 / 同步
 *   - /admin/models/providers      供应商列表
 *
 * 导入 AdminAuthModule 以复用 AdminGuard；
 * 复用现有 ModelEntity（models 表），不新增实体。
 */
@Module({
  imports: [TypeOrmModule.forFeature([ModelEntity]), AdminAuthModule],
  controllers: [AdminModelController],
  providers: [AdminModelService],
  exports: [AdminModelService],
})
export class AdminModelModule {}
