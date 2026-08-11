import matter from 'gray-matter';
import type { AssetImportType } from '../admin-imports.constants';
import { resolveAssetCategory } from './category-resolver';
import type {
  ImportFile,
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

/** frontmatter trigger → 关键词数组（字符串或数组均归一） */
function toKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

/** Skill 解析器：扫描任意层级 SKILL.md（含大小写变体），frontmatter trigger → triggerKeywords */
export class SkillParser implements ImportParser {
  readonly type: AssetImportType = 'skill';

  async parse(ctx: ImportParseContext): Promise<ImportedAssetDraft[]> {
    const drafts: ImportedAssetDraft[] = [];
    for (const file of ctx.files) {
      if (file.content == null) continue;
      const base = file.path.split('/').pop() ?? '';
      if (base.toLowerCase() !== 'skill.md') continue;
      const draft = this.parseSkillMd(file, ctx);
      if (draft) drafts.push(draft);
    }
    return drafts;
  }

  private parseSkillMd(file: ImportFile, ctx: ImportParseContext): ImportedAssetDraft | null {
    if (file.content == null) return null;
    let fm: Record<string, unknown> = {};
    let body = '';
    try {
      const parsed = matter(file.content);
      fm = parsed.data ?? {};
      body = (parsed.content ?? '').trim();
    } catch {
      fm = {};
      body = file.content.trim();
    }
    const rawName = asString(fm.name).trim();
    const name = rawName || parentDir(file.path) || 'skill';
    const displayName = asString(fm.display_name).trim() || asString(fm.displayName).trim() || name;
    const description = asString(fm.description).trim() || body.slice(0, 2000);
    const entryPoint = asString(fm.entry_point).trim() || asString(fm.entryPoint).trim() || undefined;
    const triggerKeywords = toKeywords(fm.trigger);
    const payload: Record<string, unknown> = {
      skillType: 'skill',
      runtimeType: 'openclaw',
      skillMdPath: file.path,
      triggerKeywords,
    };
    if (entryPoint) payload.entryPoint = entryPoint;
    return {
      type: 'skill',
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
    };
  }
}
