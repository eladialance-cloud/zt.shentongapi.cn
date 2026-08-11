import type { AssetImportType } from '../admin-imports.constants';
import { resolveAssetCategory } from './category-resolver';
import type {
  ImportParseContext,
  ImportedAssetDraft,
  ImportParser,
} from './import-parser.interface';

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parentDir(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts[parts.length - 1] ?? '';
}

/** Skill Pack 解析器：扫描任意层级 manifest.json 或 *.pack.json → hermes 技能包草稿 */
export class SkillPackParser implements ImportParser {
  readonly type: AssetImportType = 'skill_pack';

  async parse(ctx: ImportParseContext): Promise<ImportedAssetDraft[]> {
    const drafts: ImportedAssetDraft[] = [];
    for (const file of ctx.files) {
      if (file.content == null) continue;
      const base = (file.path.split('/').pop() ?? '').toLowerCase();
      const isManifest = base === 'manifest.json';
      const isPackJson = /\.pack\.json$/i.test(file.path);
      if (!isManifest && !isPackJson) continue;
      let manifest: Record<string, unknown>;
      try {
        const v = JSON.parse(file.content);
        if (typeof v !== 'object' || v === null || Array.isArray(v)) continue;
        manifest = v as Record<string, unknown>;
      } catch {
        continue;
      }
      // 仅接受具备 skills 数组或 hermes 特征的 manifest（避免 PWA/Chrome 扩展误判）
      const hasSkills = Array.isArray(manifest.skills);
      const isHermes = manifest.runtimeType === 'hermes';
      if (!hasSkills && !isHermes) continue;
      const rawName = asString(manifest.name).trim();
      const name = rawName || parentDir(file.path) || 'skill-pack';
      const displayName = asString(manifest.displayName).trim() || name;
      const description = asString(manifest.description);
      const skillIds = Array.isArray(manifest.skills)
        ? manifest.skills.filter((v): v is string => typeof v === 'string')
        : [];
      const payload: Record<string, unknown> = { runtimeType: 'hermes', skillIds };
      const execConfig = manifest.execConfig;
      if (execConfig && typeof execConfig === 'object' && !Array.isArray(execConfig)) {
        payload.execConfig = execConfig;
      }
      drafts.push({
        type: 'skill_pack',
        name,
        displayName,
        description,
        category: resolveAssetCategory(ctx.topics, file.path),
        tags: [],
        sourceType: 'github',
        sourceRepo: ctx.repoUrl,
        sourcePath: file.path,
        githubTopics: ctx.topics,
        payload,
      });
    }
    return drafts;
  }
}
