import { AnalysisResult, SkillAdapterInterface, SkillManifest } from './skill-adapter.interface';
import { ManifestGenerator } from './manifest-generator';
export declare class GitHubAdapter implements SkillAdapterInterface {
    private readonly manifestGenerator;
    private readonly logger;
    constructor(manifestGenerator: ManifestGenerator);
    fetch(url: string): Promise<string>;
    analyze(localPath: string): Promise<AnalysisResult>;
    generateManifest(localPath: string, analysis: AnalysisResult): Promise<SkillManifest>;
    installDependencies(localPath: string, deps: Record<string, unknown>): Promise<void>;
    private collectFiles;
    private extensionToLanguage;
    private detectMultiStepProcess;
    private buildBaseManifest;
    private resolveCloneUrl;
    private pathExists;
}
