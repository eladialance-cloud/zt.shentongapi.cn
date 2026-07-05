import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PluginEntity } from '../plugin/entities/plugin.entity';
import { AdminPluginController } from './admin-plugin.controller';
import { AdminPluginService } from './admin-plugin.service';

/**
 * 管理端插件模块
 * 数据合同真源：Task 22 - 插件管理
 *
 * 复用现有 PluginEntity（modules/plugin/entities/plugin.entity.ts）。
 * 导入 AdminAuthModule 以复用 AdminGuard（依赖独立 admin JwtService）。
 * 注意：本模块不在此处注册到 AppModule，由后续任务统一注册。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PluginEntity]), AdminAuthModule],
  controllers: [AdminPluginController],
  providers: [AdminPluginService],
  exports: [AdminPluginService],
})
export class AdminPluginModule {}
