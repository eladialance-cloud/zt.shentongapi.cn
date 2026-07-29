import { Repository } from 'typeorm';
import { WorkflowEntity } from './entities/workflow.entity';
import { AdminWorkflowQueryDto, AdminWorkflowReviewQueryDto, CreateAdminWorkflowDto, UpdateAdminWorkflowDto } from './dto/workflow.dto';
export declare class AdminWorkflowService {
    private readonly repo;
    constructor(repo: Repository<WorkflowEntity>);
    list(query: AdminWorkflowQueryDto): Promise<{
        list: WorkflowEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    detail(id: number): Promise<WorkflowEntity>;
    create(dto: CreateAdminWorkflowDto): Promise<WorkflowEntity>;
    update(id: number, dto: UpdateAdminWorkflowDto): Promise<void>;
    remove(id: number): Promise<void>;
    listReview(query: AdminWorkflowReviewQueryDto): Promise<{
        list: WorkflowEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    approve(id: number): Promise<void>;
    reject(id: number, reason: string): Promise<void>;
    review(id: number, action: 'approve' | 'reject', reason?: string): Promise<void>;
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
        executionTrend: Array<{
            date: string;
            count: number;
        }>;
    }>;
}
