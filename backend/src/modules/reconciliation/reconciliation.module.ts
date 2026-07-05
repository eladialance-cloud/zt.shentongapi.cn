import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconciliationDiffEntity } from './entities/reconciliation-diff.entity';
import { ReconciliationService } from './services/reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { CreditsModule } from '../credits/credits.module';

/**
 * 对账模块
 * 数据合同真源：Task 30 - 对账体系
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ReconciliationDiffEntity]),
    CreditsModule,
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
