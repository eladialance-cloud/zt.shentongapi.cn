import { OnModuleInit } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { ReconciliationDiffEntity, ReconciliationDiffType } from '../entities/reconciliation-diff.entity';
import { CreditsService } from '../../credits/services/credits.service';
import { PaginationQuery, PaginatedResult } from '../../../common/types/pagination.type';
export declare class ReconciliationService implements OnModuleInit {
    private diffRepo;
    private dataSource;
    private creditsService;
    private readonly logger;
    constructor(diffRepo: Repository<ReconciliationDiffEntity>, dataSource: DataSource, creditsService: CreditsService);
    onModuleInit(): void;
    reconcileBalanceVsTransactions(): Promise<ReconciliationDiffEntity[]>;
    reconcileTokenUsage(): Promise<ReconciliationDiffEntity[]>;
    reconcilePaymentVsOrders(): Promise<ReconciliationDiffEntity[]>;
    reconcileApiKeyPoolDeduction(): Promise<ReconciliationDiffEntity[]>;
    runAllReconciliations(): Promise<{
        balance_vs_txn: number;
        token_usage: number;
        payment_vs_order: number;
        apikey_pool_deduction: number;
    }>;
    getDiffs(query: PaginationQuery & {
        type?: ReconciliationDiffType;
        status?: string;
    }): Promise<PaginatedResult<ReconciliationDiffEntity>>;
    adjustDiff(diffId: number, adminId: number, amount: number, remark?: string): Promise<ReconciliationDiffEntity>;
    ignoreDiff(diffId: number, adminId: number, remark?: string): Promise<ReconciliationDiffEntity>;
    health(): {
        status: string;
        module: string;
    };
    private scheduleDaily;
}
