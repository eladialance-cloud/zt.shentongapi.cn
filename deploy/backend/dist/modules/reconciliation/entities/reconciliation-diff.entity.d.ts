export type ReconciliationDiffType = 'balance_vs_txn' | 'token_usage' | 'payment_vs_order' | 'apikey_pool_deduction';
export type ReconciliationDiffStatus = 'pending' | 'resolved' | 'ignored';
export declare class ReconciliationDiffEntity {
    id: number;
    type: ReconciliationDiffType;
    userId?: number;
    diffAmount: number;
    detail?: Record<string, unknown>;
    status: ReconciliationDiffStatus;
    resolvedBy?: number;
    resolvedAt?: Date;
    remark?: string;
    createdAt: Date;
}
