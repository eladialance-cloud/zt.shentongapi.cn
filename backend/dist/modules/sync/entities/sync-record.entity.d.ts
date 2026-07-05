export type SyncRecordType = 'chat_message' | 'agent_call' | 'workflow_execution' | 'plugin_call';
export type SyncRecordStatus = 'pending' | 'processed' | 'failed';
export declare class SyncRecordEntity {
    id: number;
    userId: number;
    clientTxnId: string;
    type: SyncRecordType;
    payload: Record<string, unknown>;
    status: SyncRecordStatus;
    errorMsg?: string;
    createdAt: Date;
    processedAt?: Date;
}
