import { Repository } from 'typeorm';
import { SkillPackageEntity } from '../entities/skill-package.entity';
import { SkillInstallLogEntity } from '../entities/skill-install-log.entity';
import { ChatSessionEntity } from '../../chat/entities/chat-session.entity';
import { CreditsService } from '../../credits/services/credits.service';
export declare class SkillRunnerService {
    private readonly packageRepo;
    private readonly logRepo;
    private readonly sessionRepo;
    private readonly creditsService;
    private readonly logger;
    constructor(packageRepo: Repository<SkillPackageEntity>, logRepo: Repository<SkillInstallLogEntity>, sessionRepo: Repository<ChatSessionEntity>, creditsService: CreditsService);
    execute(packageId: number, input: Record<string, unknown>, userId: number): Promise<unknown>;
    private executeAsOpcSkill;
    private executeAsCli;
    healthCheck(packageId: number): Promise<{
        healthy: boolean;
        detail: string;
    }>;
    private writeLog;
}
