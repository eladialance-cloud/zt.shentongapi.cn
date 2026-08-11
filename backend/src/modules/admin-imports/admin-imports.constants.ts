export const IMPORT_TYPES = ['agent', 'workflow', 'mcp', 'skill', 'skill_pack', 'n8n_mcp'] as const;
export type AssetImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_STEPS: Array<{ key: ImportStepKey; label: string }> = [
  { key: 'fetch_repo', label: '拉取仓库信息' },
  { key: 'parse', label: '解析资产' },
  { key: 'classify', label: 'AI 自动分类' },
  { key: 'save', label: '写入草稿' },
];
export type ImportStepKey = 'fetch_repo' | 'parse' | 'classify' | 'save';
