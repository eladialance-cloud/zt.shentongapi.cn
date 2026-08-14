import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SysOssConfigEntity } from './entities/sys-oss-config.entity';
import { AdminOssController } from './admin-oss.controller';
import { AdminOssService } from './admin-oss.service';
import { OssUploadService } from './oss-upload.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { CommonModule } from '../../common/common.module';

/**
 * 管理端OSS配置模块
 *
 * 提供系统级OSS存储配置管理功能，支持 local/aliyun/tencent/qiniu/minio 多种存储服务商。
 * 导入 AdminAuthModule 以使用 AdminGuard 进行管理端鉴权。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SysOssConfigEntity]),
    AdminAuthModule,
    CommonModule,
  ],
  controllers: [AdminOssController],
  providers: [AdminOssService, OssUploadService],
  exports: [AdminOssService, OssUploadService],
})
export class AdminOssModule {}
