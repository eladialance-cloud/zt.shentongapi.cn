import { Repository } from 'typeorm';
import { AgentEntity } from '../entities/agent.entity';
import { RedisService } from '../../../common/services/redis.service';
export declare class AgentService {
    private readonly agentRepo;
    private readonly redis;
    private static readonly CACHE_KEY;
    private static readonly CACHE_TTL;
    constructor(agentRepo: Repository<AgentEntity>, redis: RedisService);
    findAll(): Promise<AgentEntity[]>;
    create(data: Partial<AgentEntity>): Promise<AgentEntity>;
    update(id: number, data: Partial<AgentEntity>): Promise<void>;
    remove(id: number): Promise<void>;
    health(): {
        status: string;
        module: string;
    };
}
