// 管理端技能商店类型定义

export interface AdminSkillSource {
  id: number;
  sourceUrl: string;
  sourceType: 'github' | 'npm' | 'zip' | 'url';
  skillName: string;
  skillDesc: string;
  skillType: 'skill' | 'workflow';
  category?: string;
  autoDetectedType?: string;
  status: 'pending' | 'analyzing' | 'analyzed' | 'failed';
  analyzeResult?: Record<string, unknown>;
  errorMessage?: string;
  packageId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSkillPackage {
  id: number;
  name: string;
  displayName: string;
  description: string;
  skillType: 'skill' | 'workflow';
  runtimeType: string;
  category?: string;
  sourceUrl: string;
  sourceType?: 'github' | 'manual';
  sourceRepo?: string;
  sourcePath?: string;
  githubTopics?: string[];
  installPath?: string;
  entryPoint?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  triggerKeywords?: string[];
  examples?: Record<string, unknown>[];
  uiConfig?: { icon?: string; color?: string; [key: string]: unknown };
  opcAgentConfig?: Record<string, unknown>;
  status: 'draft' | 'reviewing' | 'approved' | 'published' | 'unpublished' | 'failed';
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  isOfficial: boolean;
  callCount: number;
  avgRating: number;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillSourceDto {
  sourceUrl: string;
  sourceType: 'github';
  skillName: string;
  skillDesc: string;
  skillType: 'skill' | 'workflow';
}

export interface UpdateSkillPackageDto {
  displayName?: string;
  description?: string;
  category?: string;
  sourceType?: 'github' | 'manual';
  sourceRepo?: string;
  sourcePath?: string;
  githubTopics?: string[];
  triggerKeywords?: string[];
  examples?: Record<string, unknown>[];
  uiConfig?: { icon?: string; color?: string; [key: string]: unknown };
  opcAgentConfig?: Record<string, unknown>;
}

export interface UpdateSkillSourceDto {
  skillName?: string;
  skillDesc?: string;
  category?: string;
}

export interface SkillSourceQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  skillType?: string;
  category?: string;
  keyword?: string;
}

export interface SkillPackageQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  skillType?: string;
  category?: string;
  reviewStatus?: string;
}

export interface RejectSkillPackageDto {
  reason: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  detail: string;
}

export interface AnalyzeTriggerResult {
  status: string;
  message: string;
}
