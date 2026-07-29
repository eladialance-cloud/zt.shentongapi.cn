export declare class OpcTaskEntity {
    id: number;
    teamId: number;
    title: string;
    description?: string;
    status: 'pending' | 'in_progress' | 'completed';
    assigneeId?: number;
    creatorId: number;
    priority: 'low' | 'medium' | 'high';
    dueDate?: Date;
    createdAt: Date;
}
