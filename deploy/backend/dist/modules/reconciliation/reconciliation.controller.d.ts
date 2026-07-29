import { ReconciliationService } from './services/reconciliation.service';
import { ICurrentUser } from '../../common/decorators/current-user.decorator';
declare class AdjustDiffDto {
    amount: number;
    remark?: string;
}
declare class IgnoreDiffDto {
    remark?: string;
}
export declare class ReconciliationController {
    private readonly service;
    constructor(service: ReconciliationService);
    health(): {
        status: string;
        module: string;
    };
    getDiffs(page?: string, pageSize?: string, type?: string, status?: string): Promise<import("../../common/types/pagination.type").PaginatedResult<import("./entities/reconciliation-diff.entity").ReconciliationDiffEntity>>;
    run(): Promise<{
        balance_vs_txn: number;
        token_usage: number;
        payment_vs_order: number;
        apikey_pool_deduction: number;
    }>;
    adjust(id: number, dto: AdjustDiffDto, user: ICurrentUser): Promise<import("./entities/reconciliation-diff.entity").ReconciliationDiffEntity>;
    ignore(id: number, dto: IgnoreDiffDto, user: ICurrentUser): Promise<import("./entities/reconciliation-diff.entity").ReconciliationDiffEntity>;
}
export {};
