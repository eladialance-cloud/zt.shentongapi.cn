import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyPoolEntity } from './entities/api-key-pool.entity';
import { ApiKeyPoolService } from './services/api-key-pool.service';
import { ApiKeyPoolController } from './api-key-pool.controller';
import { CommonModule } from '../../common/common.module';

/**
 * API Key 池模块
 * 数据合同真源：Task 32 - 数据安全设计
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKeyPoolEntity]),
    CommonModule,
  ],
  controllers: [ApiKeyPoolController],
  providers: [ApiKeyPoolService],
  exports: [ApiKeyPoolService],
})
export class ApiKeyPoolModule {}
