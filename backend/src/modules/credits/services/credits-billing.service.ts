import { Injectable } from '@nestjs/common';
import {
  CreditsService,
  CreditTxnQuery,
} from './credits.service';
import { CreditTransactionEntity, CreditTxnSource } from '../entities/credit-transaction.entity';
import { CreditAccountEntity } from '../entities/credit-account.entity';
import {
  PaginatedResult,
} from '../../../common/types/pagination.type';

/**
 * 积分计费服务：面向业务调用方（模型/插件/工作流/知识库）
 * 数据合同真源：Task 29 - 积分数据流完整链路（计费服务）
 * 封装「预估冻结 → 结算实际成本 / 退款」标准流程
 */
@Injectable()
export class CreditsBillingService {
  constructor(private creditsService: CreditsService) {}

  /** 预估并冻结：返回冻结流水（frozenTxnId = txn.id） */
  async estimateAndFreeze(
    userId: number,
    source: CreditTxnSource,
    sourceId: string,
    estimatedCost: number,
  ): Promise<CreditTransactionEntity> {
    return this.creditsService.freezeCredits(userId, estimatedCost, source, sourceId);
  }

  /** 结算实际成本（多退少补，幂等） */
  async settleActualCost(
    userId: number,
    frozenTxnId: number,
    actualCost: number,
  ): Promise<CreditTransactionEntity> {
    return this.creditsService.settleCredits(userId, frozenTxnId, actualCost);
  }

  /** 退款（全额退回冻结金额） */
  async refund(
    userId: number,
    frozenTxnId: number,
  ): Promise<CreditTransactionEntity> {
    return this.creditsService.refundCredits(userId, frozenTxnId);
  }

  /** 透传：查询账户 */
  async getAccount(userId: number): Promise<CreditAccountEntity> {
    return this.creditsService.getAccount(userId);
  }

  /** 透传：查询流水 */
  async getTransactions(
    userId: number,
    query: CreditTxnQuery,
  ): Promise<PaginatedResult<CreditTransactionEntity>> {
    return this.creditsService.getTransactions(userId, query);
  }
}
