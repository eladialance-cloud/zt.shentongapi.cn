import { WorkflowService } from '../services/workflow.service';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
export declare class WorkflowController {
    private readonly workflowService;
    constructor(workflowService: WorkflowService);
    health(): {
        status: string;
        module: string;
    };
    list(page?: string, pageSize?: string, category?: string): Promise<{
        list: import("../../admin-workflow/entities/workflow.entity").WorkflowEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    executions(user: ICurrentUser, page?: string, pageSize?: string): Promise<{
        list: never[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    detail(id: string): Promise<import("../../admin-workflow/entities/workflow.entity").WorkflowEntity>;
    execute(id: string, user: ICurrentUser, input: Record<string, unknown>): Promise<{
        workflowId: number;
        status: "pending";
        message: string;
    }>;
}
