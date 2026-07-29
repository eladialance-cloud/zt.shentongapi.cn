import { Repository } from 'typeorm';
import { WorkflowEntity } from '../../admin-workflow/entities/workflow.entity';
export declare class WorkflowService {
    private readonly workflowRepo;
    constructor(workflowRepo: Repository<WorkflowEntity>);
    list(page?: number, pageSize?: number, category?: string): Promise<{
        list: WorkflowEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    detail(id: number): Promise<WorkflowEntity>;
    execute(id: number, userId: number, input: Record<string, unknown>): Promise<{
        workflowId: number;
        status: "pending";
        message: string;
    }>;
    health(): {
        status: string;
        module: string;
    };
}
