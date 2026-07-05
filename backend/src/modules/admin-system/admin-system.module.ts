import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { SystemConfigEntity } from './entities/system-config.entity';
import { AnnouncementEntity } from './entities/announcement.entity';
import { TenantEntity } from './entities/tenant.entity';
import { AdminSystemController } from './admin-system.controller';
import { AdminTenantController } from './admin-tenant.controller';
import { AdminAnnouncementController } from './admin-announcement.controller';
import { AdminSystemService } from './admin-system.service';

/**
 * 管理端系统配置模块
 * 数据合同真源：Task 28 - 系统配置
 *
 * 覆盖前端 admin-system-api.ts 的全部端点：
 *   - /admin/system/*      系统配置 / 缓存清理
 *   - /admin/tenants       租户管理
 *   - /admin/announcements 公告管理
 *
 * 导入 AdminAuthModule 以复用 AdminGuard（依赖独立 admin JwtService）。
 * 注意：本模块不在此处注册到 AppModule，由后续任务统一注册。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SystemConfigEntity,
      AnnouncementEntity,
      TenantEntity,
    ]),
    AdminAuthModule,
  ],
  controllers: [
    AdminSystemController,
    AdminTenantController,
    AdminAnnouncementController,
  ],
  providers: [AdminSystemService],
  exports: [AdminSystemService],
})
export class AdminSystemModule {}
