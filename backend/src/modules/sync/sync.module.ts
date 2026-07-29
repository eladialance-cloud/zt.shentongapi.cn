import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SyncRecordEntity } from './entities/sync-record.entity';
import { SyncService } from './services/sync.service';
import { SyncController } from './sync.controller';
import { SyncGateway } from './sync.gateway';

/**
 * 同步模块
 * 数据合同真源：Task 31 - 数据同步设计
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SyncRecordEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [SyncController],
  providers: [SyncService, SyncGateway],
  exports: [SyncService, SyncGateway],
})
export class SyncModule {}
