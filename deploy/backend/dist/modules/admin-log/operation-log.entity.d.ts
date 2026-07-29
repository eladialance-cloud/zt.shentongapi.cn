export declare class OperationLogEntity {
    id: number;
    userId: number;
    username: string;
    type: string;
    target: string;
    operation: string;
    ip?: string;
    ua?: string;
    createdAt: Date;
}
