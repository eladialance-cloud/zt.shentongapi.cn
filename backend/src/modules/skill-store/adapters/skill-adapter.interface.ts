/** 技能源分析结果 */
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

/** 技能清单（标准化的元数据） */
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

/** 技能适配器接口 */
export interface SkillAdapterInterface {
  /** 克隆/下载源码到本地，返回本地路径 */
  fetch(url: string): Promise<string>;

  /** 分析本地目录结构 */
  analyze(localPath: string): Promise<AnalysisResult>;

  /** 生成技能清单 */
  generateManifest(
    localPath: string,
    analysis: AnalysisResult,
  ): Promise<SkillManifest>;

  /** 安装依赖（可选） */
  installDependencies(
    localPath: string,
    deps: Record<string, unknown>,
  ): Promise<void>;
}
