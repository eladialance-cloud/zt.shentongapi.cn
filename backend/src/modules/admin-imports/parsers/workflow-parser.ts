import type { AssetImportType } from '../admin-imports.constants';
import type {
  ImportParseContext,
  ImportedAssetDraft,
  ImportParser,
} from './import-parser.interface';

/** 场景目录关键词 → sceneCategory（顺序匹配，命中即返回） */
const SCENE_DIR_MAP: Array<[RegExp, string]> = [
  [/热点|监控|hotspot|monitor/i, 'hotspot_monitor'],
  [/分发|多平台|distribut|publish/i, 'multi_platform_distribution'],
  [/评论|私信|comment|dm/i, 'comment_dm_ops'],
  [/商单|复盘|review|data/i, 'commercial_data_review'],
];

/** 非工作流 json（构建/锁/配置文件/点文件等） */
const NON_WORKFLOW_JSON = /package\.json|(?:ts|js)config|lock\.json|^\.[^/]*\.json/i;

function sceneCategoryOf(path: string): string {
  for (const [re, scene] of SCENE_DIR_MAP) {
    if (re.test(path)) return scene;
  }
  return 'other';
}

/** slug 化：小写 + 连字符（保留中文），首尾连字符剔除 */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function stripExt(name: string): string {
  return name.replace(/\.json$/i, '');
}

/** Workflow 解析器：扫描 *.json（排除 package/tsconfig/lock），按场景目录归类 */
export class WorkflowParser implements ImportParser {
  readonly type: AssetImportType = 'workflow';

  async parse(ctx: ImportParseContext): Promise<ImportedAssetDraft[]> {
    const drafts: ImportedAssetDraft[] = [];
    const errors: string[] = [];
    for (const file of ctx.files) {
      if (file.content == null) continue;
      const base = file.path.split('/').pop() ?? file.path;
      if (!/\.json$/i.test(base) || NON_WORKFLOW_JSON.test(base)) continue;
      let json: Record<string, unknown>;
      try {
        const v = JSON.parse(file.content);
        if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('非 JSON 对象');
        json = v as Record<string, unknown>;
      } catch {
        errors.push(file.path);
        continue;
      }
      const nodes = json.nodes;
      if (!Array.isArray(nodes)) {
        errors.push(file.path);
        continue;
      }
      const rawName = typeof json.name === 'string' && json.name.trim() ? json.name.trim() : stripExt(base);
      const name = slugify(rawName) || 'workflow';
      const displayName =
        typeof json.displayName === 'string' && json.displayName.trim() ? json.displayName.trim() : name;
      const description = typeof json.description === 'string' ? json.description : '';
      const payload: Record<string, unknown> = {
        workflowJson: JSON.stringify(json),
        sceneCategory: sceneCategoryOf(file.path),
        engineType: 'n8n',
        nodeCount: nodes.length,
      };
      if (typeof json.triggerType === 'string') payload.triggerType = json.triggerType;
      drafts.push({
        type: 'workflow',
        name,
        displayName,
        description,
        category: 'other',
        tags: [],
        sourceType: 'github',
        sourceRepo: ctx.repoUrl,
        sourcePath: file.path,
        githubTopics: ctx.topics,
        payload,
      });
    }
    // 无效 json 跳过并计入草稿 payload.errors（不使整个导入失败）
    if (errors.length > 0) {
      for (const d of drafts) d.payload.errors = errors;
    }
    return drafts;
  }
}
