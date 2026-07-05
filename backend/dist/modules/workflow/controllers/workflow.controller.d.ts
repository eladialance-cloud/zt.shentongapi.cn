import { WorkflowService } from '../services/workflow.service';
export declare class WorkflowController {
    private readonly workflowService;
    constructor(workflowService: WorkflowService);
    health(): {
        status: string;
        module: string;
    };
}
