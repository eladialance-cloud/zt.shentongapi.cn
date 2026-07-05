export type CreditTxnType = 'recharge' | 'consume' | 'freeze' | 'settle' | 'refund' | 'reward' | 'admin_adjust';
export type CreditTxnSource = 'model_call' | 'plugin_call' | 'workflow_call' | 'kb_search' | 'recharge' | 'admin_adjust' | 'signup_reward';
export declare class CreditTransactionEntity {
    id: number;
    userId: number;
    type: CreditTxnType;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    source: CreditTxnSource;
    sourceId: string;
    frozenTxnId?: number;
    remark?: string;
    adminId?: number;
    settledAt?: Date;
    createdAt: Date;
}
