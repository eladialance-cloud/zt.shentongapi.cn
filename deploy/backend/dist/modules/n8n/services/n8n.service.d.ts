import { Repository } from 'typeorm';
import { N8nInstanceEntity } from '../entities/n8n-instance.entity';
import { N8nWorkflowEntity } from '../entities/n8n-workflow.entity';
import { RedisService } from '../../../common/services/redis.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { CreateN8nInstanceDto, UpdateN8nInstanceDto } from '../dto/n8n-instance.dto';
export declare class N8nService {
    private instanceRepo;
    private workflowRepo;
    private redisService;
    private encryptionService;
    private readonly logger;
    constructor(instanceRepo: Repository<N8nInstanceEntity>, workflowRepo: Repository<N8nWorkflowEntity>, redisService: RedisService, encryptionService: EncryptionService);
    health(): {
        status: string;
        module: string;
    };
    listInstances(userId: number): Promise<N8nInstanceEntity[]>;
    getInstance(userId: number, instanceId: number): Promise<N8nInstanceEntity>;
    createInstance(userId: number, data: CreateN8nInstanceDto): Promise<N8nInstanceEntity>;
    updateInstance(userId: number, instanceId: number, data: UpdateN8nInstanceDto): Promise<N8nInstanceEntity>;
    deleteInstance(userId: number, instanceId: number): Promise<void>;
    private buildHeaders;
    private normalizeBaseUrl;
    private callN8nApi;
    testConnection(userId: number, instanceId: number): Promise<{
        success: boolean;
        message: string;
        workflows?: number;
    }>;
    listWorkflows(userId: number, instanceId: number): Promise<N8nWorkflowEntity[]>;
    getWorkflowDetail(userId: number, instanceId: number, workflowId: string): Promise<Record<string, unknown>>;
    triggerWorkflow(userId: number, instanceId: number, workflowId: string, inputData?: Record<string, unknown>): Promise<{
        executionId: string;
        message: string;
    }>;
    getExecutionStatus(userId: number, instanceId: number, executionId: string): Promise<Record<string, unknown>>;
    activateWorkflow(userId: number, instanceId: number, workflowId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    deactivateWorkflow(userId: number, instanceId: number, workflowId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    handleWebhook(instanceId: number, workflowId: string, body: unknown, signature?: string): Promise<{
        received: boolean;
        status: string;
    }>;
}
