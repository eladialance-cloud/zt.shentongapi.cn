import { AgentService } from '../services/agent.service';
export declare class AgentController {
    private readonly agentService;
    constructor(agentService: AgentService);
    health(): {
        status: string;
        module: string;
    };
}
