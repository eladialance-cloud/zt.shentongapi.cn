import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { N8nService } from '../services/n8n.service';
import { CreateN8nInstanceDto, UpdateN8nInstanceDto } from '../dto/n8n-instance.dto';
import { TriggerWorkflowDto } from '../dto/n8n-workflow.dto';
export declare class N8nController {
    private readonly service;
    constructor(service: N8nService);
    health(): {
        status: string;
        module: string;
    };
    listInstances(user: ICurrentUser): Promise<import("../entities/n8n-instance.entity").N8nInstanceEntity[]>;
    createInstance(user: ICurrentUser, dto: CreateN8nInstanceDto): Promise<import("../entities/n8n-instance.entity").N8nInstanceEntity>;
    getInstance(user: ICurrentUser, instanceId: number): Promise<import("../entities/n8n-instance.entity").N8nInstanceEntity>;
    updateInstance(user: ICurrentUser, instanceId: number, dto: UpdateN8nInstanceDto): Promise<import("../entities/n8n-instance.entity").N8nInstanceEntity>;
    deleteInstance(user: ICurrentUser, instanceId: number): Promise<null>;
    testConnection(user: ICurrentUser, instanceId: number): Promise<{
        success: boolean;
        message: string;
        workflows?: number;
    }>;
    listWorkflows(user: ICurrentUser, instanceId: number): Promise<import("../entities/n8n-workflow.entity").N8nWorkflowEntity[]>;
    getWorkflowDetail(user: ICurrentUser, instanceId: number, workflowId: string): Promise<Record<string, unknown>>;
    triggerWorkflow(user: ICurrentUser, instanceId: number, workflowId: string, dto: TriggerWorkflowDto): Promise<{
        executionId: string;
        message: string;
    }>;
    activateWorkflow(user: ICurrentUser, instanceId: number, workflowId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    deactivateWorkflow(user: ICurrentUser, instanceId: number, workflowId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getExecutionStatus(user: ICurrentUser, instanceId: number, executionId: string): Promise<Record<string, unknown>>;
    webhookCallback(instanceId: number, workflowId: string, body: unknown, signature?: string): Promise<{
        received: boolean;
        status: string;
    }>;
}
