/**
 * Agent 导入相关常量
 * 数据合同真源：docs/agent-import-plan.md
 */

/** DB category 枚举（与 agent.entity.ts 一致） */
export type AgentCategory =
  | 'office'
  | 'programming'
  | 'copywriting'
  | 'data_analysis'
  | 'other';

/**
 * 21 个源目录 → 5 category 映射表
 * 严格依据 docs/agent-import-plan.md 第 122-148 行的分类映射表
 */
export const SOURCE_DIR_TO_CATEGORY: Record<string, AgentCategory> = {
  // → programming（工程开发 / 测试 / 安全 / 游戏开发）
  engineering: 'programming',
  testing: 'programming',
  security: 'programming',
  'game-development': 'programming',

  // → copywriting（营销 / 销售 / 付费媒体）
  marketing: 'copywriting',
  sales: 'copywriting',
  'paid-media': 'copywriting',

  // → data_analysis（金融 / 供应链 / 战略）
  finance: 'data_analysis',
  'supply-chain': 'data_analysis',
  strategy: 'data_analysis',

  // → office（设计 / 产品 / 项目管理 / 人力资源）
  design: 'office',
  product: 'office',
  'project-management': 'office',
  hr: 'office',

  // → other（学术 / 地理信息 / 空间计算 / 专业领域 / 客户支持 / 法务 / 集成工具）
  academic: 'other',
  gis: 'other',
  'spatial-computing': 'other',
  specialized: 'other',
  support: 'other',
  legal: 'other',
  integrations: 'other',
};

/** 需遍历的源目录列表（基于实际仓库结构，共 21 个） */
export const SOURCE_DIRS_TO_SCAN: string[] = Object.keys(SOURCE_DIR_TO_CATEGORY);

/** 排除的目录/文件（examples 与 assets 不导入） */
export const EXCLUDE_PATTERNS: string[] = [
  '**/examples/**',
  '**/assets/**',
  '**/README.md',
  '**/readme.md',
  '**/LICENSE',
  '**/.git/**',
];

/** 默认值常量（依据 plan.md 第 102-120 行字段映射） */
export const DEFAULT_MODEL_ID = 'gpt-4o-mini';
export const DEFAULT_CREATOR_ID = 1;
export const DEFAULT_PRICE_PER_CALL = 0;
export const DEFAULT_RUNTIME_TYPE = 'openclaw' as const;
export const BATCH_SIZE = 50;
export const CLONE_TIMEOUT_MS = 120_000;
