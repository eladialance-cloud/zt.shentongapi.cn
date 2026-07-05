import { Repository, DataSource } from 'typeorm';
import { CreditAccountEntity } from '../entities/credit-account.entity';
import { CreditTransactionEntity, CreditTxnSource, CreditTxnType } from '../entities/credit-transaction.entity';
import { RedisService } from '../../../common/services/redis.service';
import { PaginationQuery, PaginatedResult } from '../../../common/types/pagination.type';
export interface CreditTxnQuery extends PaginationQuery {
    type?: CreditTxnType;
    source?: CreditTxnSource;
    startDate?: string;
    endDate?: string;
}
export declare class CreditsService {
    private accountRepo;
    private txnRepo;
    private dataSource;
    private redis;
    constructor(accountRepo: Repository<CreditAccountEntity>, txnRepo: Repository<CreditTransactionEntity>, dataSource: DataSource, redis: RedisService);
    getOrCreateAccount(userId: number): Promise<CreditAccountEntity>;
    getAccount(userId: number): Promise<CreditAccountEntity>;
    rechargeCredits(userId: number, amount: number, sourceId: string, remark?: string): Promise<CreditTransactionEntity>;
    rewardCredits(userId: number, amount: number, source: CreditTxnSource, sourceId: string, remark?: string): Promise<CreditTransactionEntity>;
    adminAdjust(userId: number, amount: number, adminId: number, remark?: string): Promise<CreditTransactionEntity>;
    freezeCredits(userId: number, amount: number, source: CreditTxnSource, sourceId: string): Promise<CreditTransactionEntity>;
    settleCredits(userId: number, frozenTxnId: number, actualAmount: number): Promise<CreditTransactionEntity>;
    refundCredits(userId: number, frozenTxnId: number): Promise<CreditTransactionEntity>;
    getTransactions(userId: number, query: CreditTxnQuery): Promise<PaginatedResult<CreditTransactionEntity>>;
    private withLock;
    private getOrCreateAccountLocked;
    private updateAccountVersioned;
    private sleep;
    health(): {
        status: string;
        module: string;
    };
}
