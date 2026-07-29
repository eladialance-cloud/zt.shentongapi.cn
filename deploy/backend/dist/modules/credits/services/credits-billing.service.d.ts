import { CreditsService, CreditTxnQuery } from './credits.service';
import { CreditTransactionEntity, CreditTxnSource } from '../entities/credit-transaction.entity';
import { CreditAccountEntity } from '../entities/credit-account.entity';
import { PaginatedResult } from '../../../common/types/pagination.type';
export declare class CreditsBillingService {
    private creditsService;
    constructor(creditsService: CreditsService);
    estimateAndFreeze(userId: number, source: CreditTxnSource, sourceId: string, estimatedCost: number): Promise<CreditTransactionEntity>;
    settleActualCost(userId: number, frozenTxnId: number, actualCost: number): Promise<CreditTransactionEntity>;
    refund(userId: number, frozenTxnId: number): Promise<CreditTransactionEntity>;
    getAccount(userId: number): Promise<CreditAccountEntity>;
    getTransactions(userId: number, query: CreditTxnQuery): Promise<PaginatedResult<CreditTransactionEntity>>;
}
