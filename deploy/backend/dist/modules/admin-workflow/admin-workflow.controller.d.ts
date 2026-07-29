import { AdminWorkflowService } from './admin-workflow.service';
import { AdminWorkflowQueryDto, AdminWorkflowReviewQueryDto, CreateAdminWorkflowDto, UpdateAdminWorkflowDto } from './dto/workflow.dto';
import { WorkflowRejectDto, WorkflowReviewDto } from './dto/review.dto';
export declare class AdminWorkflowController {
    private readonly service;
    constructor(service: AdminWorkflowService);
    list(query: AdminWorkflowQueryDto): Promise<{
        list: import("./entities/workflow.entity").WorkflowEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    create(dto: CreateAdminWorkflowDto): Promise<import("./entities/workflow.entity").WorkflowEntity>;
    listReview(query: AdminWorkflowReviewQueryDto): Promise<{
        list: import("./entities/workflow.entity").WorkflowEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    stats(): Promise<{
        total: number;
        active: number;
        pending: number;
        approved: number;
        rejected: number;
        published: number;
        byEngineType: {
            engineType: string;
            total: number;
            active: number;
            executionCount: number;
        }[];
        topWorkflows: {
            id: number;
            name: string;
            engineType: import("./entities/workflow.entity").WorkflowEngineType;
            executionCount: number;
        }[];
        executionTrend: {
            date: string;
            count: number;
        }[];
    }>;
    detail(id: number): Promise<import("./entities/workflow.entity").WorkflowEntity>;
    update(id: number, dto: UpdateAdminWorkflowDto): Promise<null>;
    remove(id: number): Promise<null>;
    review(id: number, dto: WorkflowReviewDto): Promise<null>;
    approve(id: number): Promise<null>;
    reject(id: number, dto: WorkflowRejectDto): Promise<null>;
}
