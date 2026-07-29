import { Repository } from 'typeorm';
import { HermesInstanceEntity } from '../entities/hermes-instance.entity';
import { HermesCallLogEntity } from '../entities/hermes-call-log.entity';
import { HermesSkillEntity } from '../entities/hermes-skill.entity';
import { CreditsService } from '../../credits/services/credits.service';
import { McpService } from '../../mcp/services/mcp.service';
import { N8nService } from '../../n8n/services/n8n.service';
import { OpenClawService } from '../../openclaw/services/openclaw.service';
import { CreateInstanceDto, PaginationDto } from '../dto/hermes.dto';
export interface HermesTask {
    userId: number;
    instanceId: number;
    callType: 'skill_execute' | 'tool_call' | 'agent_invoke' | 'workflow_run';
    target: string;
    input: Record<string, unknown>;
    pricePerMinute: number;
    skillId?: number;
    serverId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
    agentId?: number;
    n8nInstanceId?: number;
    workflowId?: string;
}
export declare class HermesService {
    private instanceRepo;
    private callLogRepo;
    private skillRepo;
    private creditsService;
    private mcpService;
    private n8nService;
    private openclawService;
    private readonly logger;
    constructor(instanceRepo: Repository<HermesInstanceEntity>, callLogRepo: Repository<HermesCallLogEntity>, skillRepo: Repository<HermesSkillEntity>, creditsService: CreditsService, mcpService: McpService, n8nService: N8nService, openclawService: OpenClawService);
    listInstances(userId: number): Promise<HermesInstanceEntity[]>;
    createInstance(userId: number, dto: CreateInstanceDto): Promise<HermesInstanceEntity>;
    getInstance(userId: number, instanceId: number): Promise<HermesInstanceEntity>;
    startInstance(userId: number, instanceId: number): Promise<HermesInstanceEntity>;
    stopInstance(userId: number, instanceId: number): Promise<HermesInstanceEntity>;
    deleteInstance(userId: number, instanceId: number): Promise<void>;
    getCallLogs(userId: number, instanceId: number, query: PaginationDto): Promise<{
        list: HermesCallLogEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    unmountSkill(userId: number, instanceId: number, skillId: number): Promise<HermesInstanceEntity>;
    listMarketSkills(): Promise<HermesSkillEntity[]>;
    listInstalledSkills(userId: number): Promise<HermesSkillEntity[]>;
    installSkill(userId: number, skillId: number): Promise<HermesSkillEntity>;
    executeTask(task: HermesTask): Promise<unknown>;
    private invokeAgent;
    private runWorkflow;
    private callTool;
    private executeSkill;
    health(): {
        status: string;
        module: string;
    };
}
