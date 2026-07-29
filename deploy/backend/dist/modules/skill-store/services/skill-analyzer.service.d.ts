import { Repository } from 'typeorm';
import { SkillSourceEntity } from '../entities/skill-source.entity';
import { SkillPackageEntity } from '../entities/skill-package.entity';
import { GitHubAdapter } from '../adapters/github-adapter';
import { ManifestGenerator } from '../adapters/manifest-generator';
export declare class SkillAnalyzerService {
    private readonly sourceRepo;
    private readonly packageRepo;
    private readonly githubAdapter;
    private readonly manifestGenerator;
    private readonly logger;
    constructor(sourceRepo: Repository<SkillSourceEntity>, packageRepo: Repository<SkillPackageEntity>, githubAdapter: GitHubAdapter, manifestGenerator: ManifestGenerator);
    analyze(sourceId: number): Promise<SkillPackageEntity>;
    private determineSkillType;
    private getAdapter;
    private buildPackage;
}
