import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { LandingBlockEntity } from './entities/landing-block.entity';
import { LandingController } from './landing.controller';
import { AdminLandingController } from './admin-landing.controller';
import { LandingService } from './landing.service';

/**
 * Landing 内容管理模块
 * 数据合同真源：Landing 内容管理模块
 *
 * 导入 AdminAuthModule 以复用 AdminGuard（依赖独立 admin JwtService）。
 * 本模块不在此处注册到 AppModule，由后续任务统一注册。
 */
@Module({
  imports: [TypeOrmModule.forFeature([LandingBlockEntity]), AdminAuthModule],
  controllers: [LandingController, AdminLandingController],
  providers: [LandingService],
  exports: [LandingService],
})
export class LandingModule {}
