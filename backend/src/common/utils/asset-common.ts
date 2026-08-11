/** 资产市场公共字段工具：六类资产统一 source_type/github_topics/pricing 规范化（Phase 1） */

/** 资产添加方式：github=GitHub 导入，manual=手工创建。
 *  注意：agents 表现有 source_type(official/user/imported) 语义为「归属」，不迁移，
 *  本类型仅用于其余五表（workflows/mcp_catalog/skill_packages/hermes_skills/plugins）。 */
export type AssetSourceType = 'github' | 'manual';

/** 智能体/技能/技能包分类（与 agents.category 枚举一致，设计文档 3.1/3.4/3.5） */
export const AGENT_CATEGORIES = [
  'office',
  'programming',
  'copywriting',
  'data_analysis',
  'other',
] as const;
export type AgentCategoryType = (typeof AGENT_CATEGORIES)[number];

/** 工作流场景分类（设计文档 3.2：目录树 workflow-json 场景文件夹落库） */
export const WORKFLOW_SCENE_CATEGORIES = [
  'hotspot_monitor',
  'multi_platform_distribution',
  'comment_dm_ops',
  'commercial_data_review',
  'other',
] as const;
export type WorkflowSceneCategoryType = (typeof WORKFLOW_SCENE_CATEGORIES)[number];

/** 插件/MCP 分类（设计文档 3.3） */
export const MCP_CATEGORIES = [
  'database',
  'search',
  'browser',
  'git',
  'files',
  'messaging',
  'ai',
  'devops',
  'other',
] as const;
export type McpCategoryType = (typeof MCP_CATEGORIES)[number];

/** GitHub 公共来源字段（导入时快照，落地到各表） */
export interface GitHubSourceFields {
  sourceType: AssetSourceType;
  sourceRepo?: string;
  sourcePath?: string;
  githubTopics?: string[];
  pricing?: Record<string, unknown>;
}

/** 标签规范化：过滤非字符串、去空白、先截断 32 字符、再以截断后值去重 */
export function normalizeTags(tags?: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const v = t.trim().slice(0, 32);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** 从 DTO 提取 GitHub 公共字段：sourceType/githubTopics 恒有值，其余字段空值剔除（trim 后入库，不输出 undefined 键） */
export function pickGitHubSourceFields(dto: object): GitHubSourceFields {
  const raw = dto as Record<string, unknown>;
  const out: GitHubSourceFields = {
    sourceType: raw.sourceType === 'github' ? 'github' : 'manual',
    githubTopics: normalizeTags(raw.githubTopics),
  };
  if (typeof raw.sourceRepo === 'string' && raw.sourceRepo.trim()) {
    out.sourceRepo = raw.sourceRepo.trim();
  }
  if (typeof raw.sourcePath === 'string' && raw.sourcePath.trim()) {
    out.sourcePath = raw.sourcePath.trim();
  }
  if (raw.pricing && typeof raw.pricing === 'object' && !Array.isArray(raw.pricing)) {
    out.pricing = raw.pricing as Record<string, unknown>;
  }
  return out;
}
