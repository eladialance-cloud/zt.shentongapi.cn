import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UserEntity } from '../user/entities/user.entity';
import { RoleEntity } from '../user/entities/role.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';
import { CommonModule } from '../../common/common.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthStrategy } from './admin-auth.strategy';
import { AdminGuard } from './admin.guard';

/**
 * 管理端认证模块
 * 数据合同真源：Task 17 - 管理端认证与权限
 *
 * 使用独立的 JwtModule（ADMIN_JWT_SECRET / ADMIN_JWT_EXPIRES_IN），
 * 与用户端 JwtModule（AppModule 中注册）隔离，避免 secret 混淆。
 * AdminGuard 依赖本模块的 JwtService，并导出供其它 admin 模块复用。
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ADMIN_JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('ADMIN_JWT_EXPIRES_IN', '8h'),
        },
      }),
    }),
    TypeOrmModule.forFeature([UserEntity, RoleEntity, UserRoleEntity]),
    CommonModule,
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthStrategy, AdminGuard],
  exports: [AdminGuard, AdminAuthService, JwtModule],
})
export class AdminAuthModule {}
