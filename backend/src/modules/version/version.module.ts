import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientVersionEntity } from './entities/client-version.entity';
import { VersionService } from './services/version.service';
import { VersionController } from './version.controller';

/**
 * 客户端版本管理模块
 * 数据合同真源：Task 27 - 客户端版本管理
 */
@Module({
  imports: [TypeOrmModule.forFeature([ClientVersionEntity])],
  controllers: [VersionController],
  providers: [VersionService],
  exports: [VersionService],
})
export class VersionModule {}
