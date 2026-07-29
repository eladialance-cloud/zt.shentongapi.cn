import { Repository } from 'typeorm';
import { SkillSourceEntity } from '../skill-store/entities/skill-source.entity';
import { SkillPackageEntity } from '../skill-store/entities/skill-package.entity';
import { SkillInstallLogEntity } from '../skill-store/entities/skill-install-log.entity';
import { SkillAnalyzerService } from '../skill-store/services/skill-analyzer.service';
import { SkillRunnerService } from '../skill-store/services/skill-runner.service';
import { CreateSkillSourceDto, SkillSourceQueryDto } from './dto/skill-source.dto';
import { SkillPackageQueryDto, UpdateSkillPackageDto } from './dto/skill-package.dto';
export declare class AdminSkillStoreService {
    private readonly sourceRepo;
    private readonly packageRepo;
    private readonly installLogRepo;
    private readonly analyzerService;
    private readonly skillRunnerService;
    constructor(sourceRepo: Repository<SkillSourceEntity>, packageRepo: Repository<SkillPackageEntity>, installLogRepo: Repository<SkillInstallLogEntity>, analyzerService: SkillAnalyzerService, skillRunnerService: SkillRunnerService);
    createSource(dto: CreateSkillSourceDto): Promise<SkillSourceEntity>;
    listSources(query: SkillSourceQueryDto): Promise<{
        list: SkillSourceEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    listPackages(query: SkillPackageQueryDto): Promise<{
        list: SkillPackageEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    removeSource(id: number): Promise<void>;
    packageDetail(id: number): Promise<SkillPackageEntity>;
    updatePackage(id: number, dto: UpdateSkillPackageDto): Promise<void>;
    submitReview(id: number): Promise<void>;
    approve(id: number): Promise<void>;
    reject(id: number, reason: string): Promise<void>;
    publish(id: number): Promise<void>;
    unpublish(id: number): Promise<void>;
    removePackage(id: number): Promise<void>;
    triggerAnalyze(id: number): Promise<{
        status: string;
        message: string;
    }>;
    healthCheck(id: number): Promise<{
        healthy: boolean;
        detail: string;
    }>;
}
