import { Repository } from 'typeorm';
import { OpenClawInstanceEntity } from '../entities/openclaw-instance.entity';
import { AgentEntity } from '../../agent/entities/agent.entity';
import { RegisterInstanceDto, UpdateConfigDto } from '../dto/openclaw.dto';
import { ConfigService } from '@nestjs/config';
import { CreditsService } from '../../credits/services/credits.service';
export declare class OpenClawService {
    private instanceRepo;
    private agentRepo;
    private configService;
    private creditsService;
    private readonly logger;
    constructor(instanceRepo: Repository<OpenClawInstanceEntity>, agentRepo: Repository<AgentEntity>, configService: ConfigService, creditsService: CreditsService);
    listInstances(userId: number): Promise<OpenClawInstanceEntity[]>;
    registerInstance(userId: number, dto: RegisterInstanceDto): Promise<OpenClawInstanceEntity>;
    deleteInstance(userId: number, id: number): Promise<void>;
    getInstance(userId: number, id: number): Promise<OpenClawInstanceEntity>;
    syncAgent(userId: number, id: number): Promise<{
        success: boolean;
        message: string;
    }>;
    getStatus(userId: number, id: number): Promise<{
        status: string;
        endpoint: string;
        lastHeartbeatAt: Date | undefined;
    }>;
    healthCheck(): Promise<{
        status: string;
        endpoint: string;
    }>;
    updateConfig(userId: number, id: number, dto: UpdateConfigDto): Promise<OpenClawInstanceEntity>;
    invokeAgent(userId: number, openclawAgentId: string, message: string, history?: Array<{
        role: string;
        content: string;
    }>): Promise<unknown>;
    health(): {
        status: string;
        module: string;
    };
}
