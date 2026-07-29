export interface AnalysisResult {
    hasSkillMd: boolean;
    hasRequirementsTxt: boolean;
    hasPackageJson: boolean;
    hasDockerfile: boolean;
    hasMainPy: boolean;
    hasIndexJs: boolean;
    hasWorkflowDefinition: boolean;
    hasMultiStepProcess: boolean;
    hasCompleteEntryPoint: boolean;
    readmeContent?: string;
    detectedLanguages: string[];
}
export interface SkillManifest {
    name: string;
    displayName: string;
    description: string;
    skillType: 'skill' | 'workflow';
    runtimeType: string;
    category?: string;
    sourceUrl: string;
    installPath: string;
    skillMdPath?: string;
    entryPoint?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    dependencies?: Record<string, unknown>;
    triggerKeywords?: string[];
    examples?: Record<string, unknown>[];
    uiConfig?: Record<string, unknown>;
    opcAgentConfig?: Record<string, unknown>;
}
export interface SkillAdapterInterface {
    fetch(url: string): Promise<string>;
    analyze(localPath: string): Promise<AnalysisResult>;
    generateManifest(localPath: string, analysis: AnalysisResult): Promise<SkillManifest>;
    installDependencies(localPath: string, deps: Record<string, unknown>): Promise<void>;
}
