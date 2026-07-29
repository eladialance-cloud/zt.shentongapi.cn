import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuntimeVersionEntity } from './entities/runtime-version.entity';
import { RuntimeService } from './services/runtime.service';
import { RuntimeController } from './runtime.controller';

/**
 * 运行时引擎版本管理模块
 * 数据合同真源：深瞳AI_全栈部署方案_20260708.md 第 3.3 节
 */
@Module({
  imports: [TypeOrmModule.forFeature([RuntimeVersionEntity])],
  controllers: [RuntimeController],
  providers: [RuntimeService],
  exports: [RuntimeService],
})
export class RuntimeModule {}
