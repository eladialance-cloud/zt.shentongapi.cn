import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity } from '../user/entities/role.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminRoleController } from './admin-role.controller';
import { AdminRoleService } from './admin-role.service';

/**
 * 管理端角色模块
 * 数据合同真源：Task 17 - 管理端认证与权限
 * 导入 AdminAuthModule 以复用 AdminGuard。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, UserRoleEntity]),
    AdminAuthModule,
  ],
  controllers: [AdminRoleController],
  providers: [AdminRoleService],
  exports: [AdminRoleService],
})
export class AdminRoleModule {}
