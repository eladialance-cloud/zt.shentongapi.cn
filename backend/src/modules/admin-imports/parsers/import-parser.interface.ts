import type { AssetImportType } from '../admin-imports.constants';

/** 导入产物的统一草稿 DTO（六类资产公共字段） */
export interface ImportedAssetDraft {
  type: AssetImportType;
  /** 唯一标识名（slug，导入时 name 冲突则跳过并计入 result.skipped） */
  name: string;
  displayName: string;
  description: string;
  category?: string;
  tags: string[];
  sourceType: 'github';
  sourceRepo: string;
  sourcePath: string;
  githubTopics: string[];
  /** 各类型专属字段（见各 parser 的 payload 说明） */
  payload: Record<string, unknown>;
}

export interface ImportFile {
  path: string;
  content: string | null;
}

export interface ImportParseContext {
  repoUrl: string;
  branch?: string;
  topics: string[];
  files: ImportFile[]; // 关键文件已拉取（解析器按需读取）
}

export interface ImportParser {
  type: AssetImportType;
  /** 返回 0..n 个草稿；解析失败抛 BusinessException（整个导入失败） */
  parse(ctx: ImportParseContext): Promise<ImportedAssetDraft[]>;
}

/** 工具：从 topics 中匹配已知分类关键词（GitHub topics → 分类映射兜底） */
export function categoryFromTopics(topics: string[], map: Record<string, string>, fallback: string): string {
  for (const t of topics) {
    const hit = map[t.toLowerCase()];
    if (hit) return hit;
  }
  return fallback;
}
